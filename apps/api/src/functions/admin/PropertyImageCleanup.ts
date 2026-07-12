import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { z } from "zod";
import { getSqlPool } from "../../lib/sql";

const DEFAULT_CONTAINER_NAME = "property-images";
const DEFAULT_MIN_AGE_DAYS = 30;
const MAX_DELETE_COUNT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

type PropertyImageUrlRow = {
  image_url: string;
};

type StorageContext = {
  containerClient: ContainerClient;
  containerName: string;
  accountName: string;
  publicBaseUrl: string | null;
};

type CleanupCandidate = {
  blobName: string;
  imageUrl: string;
  contentType: string | null;
  size: number;
  lastModified: string;
  ageDays: number;
};

type CleanupResult = {
  blobName: string;
  status: "deleted" | "skipped" | "failed";
  reason?: string;
};

const cleanupRequestSchema = z.object({
  confirm: z.literal(true),
  minAgeDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .default(DEFAULT_MIN_AGE_DAYS),
  blobNames: z
    .array(z.string().trim().min(1).max(1024))
    .min(1)
    .max(MAX_DELETE_COUNT),
});

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function getStorageContext(): StorageContext {
  const connectionString = getRequiredEnv(
    "AZURE_STORAGE_CONNECTION_STRING",
  );

  const containerName =
    process.env.PROPERTY_IMAGES_CONTAINER_NAME ??
    DEFAULT_CONTAINER_NAME;

  const accountNameMatch =
    connectionString.match(/AccountName=([^;]+)/);

  const accountName = accountNameMatch?.[1];

  if (!accountName) {
    throw new Error(
      "Could not detect storage account name from AZURE_STORAGE_CONNECTION_STRING.",
    );
  }

  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);

  return {
    containerClient:
      blobServiceClient.getContainerClient(containerName),
    containerName,
    accountName,
    publicBaseUrl:
      process.env.PROPERTY_IMAGES_PUBLIC_BASE_URL ?? null,
  };
}

function buildPublicImageUrl(
  storage: StorageContext,
  blobName: string,
): string {
  if (storage.publicBaseUrl) {
    return `${storage.publicBaseUrl.replace(/\/+$/g, "")}/${blobName}`;
  }

  return `https://${storage.accountName}.blob.core.windows.net/${storage.containerName}/${blobName}`;
}

function extractBlobNameFromUrl(
  imageUrl: string,
  storage: StorageContext,
): string | null {
  try {
    const parsedImageUrl = new URL(imageUrl);

    if (storage.publicBaseUrl) {
      const parsedBaseUrl = new URL(storage.publicBaseUrl);
      const basePath = `${parsedBaseUrl.pathname.replace(/\/+$/g, "")}/`;

      if (
        parsedImageUrl.origin === parsedBaseUrl.origin &&
        parsedImageUrl.pathname.startsWith(basePath)
      ) {
        const blobName =
          parsedImageUrl.pathname.slice(basePath.length);

        return blobName
          ? decodeURIComponent(blobName)
          : null;
      }
    }

    const expectedHost =
      `${storage.accountName}.blob.core.windows.net`.toLowerCase();

    const containerPath =
      `/${storage.containerName.replace(/^\/+|\/+$/g, "")}/`;

    if (
      parsedImageUrl.hostname.toLowerCase() === expectedHost &&
      parsedImageUrl.pathname.startsWith(containerPath)
    ) {
      const blobName =
        parsedImageUrl.pathname.slice(containerPath.length);

      return blobName
        ? decodeURIComponent(blobName)
        : null;
    }

    return null;
  } catch {
    return null;
  }
}

function isSafeBlobName(blobName: string): boolean {
  if (!blobName || blobName.length > 1024) {
    return false;
  }

  if (
    blobName.startsWith("/") ||
    blobName.includes("\\") ||
    blobName.includes("\0")
  ) {
    return false;
  }

  return !blobName
    .split("/")
    .some((segment) => segment === "..");
}

function calculateAgeDays(lastModified: Date): number {
  return Math.max(
    0,
    Math.floor(
      (Date.now() - lastModified.getTime()) / DAY_MS,
    ),
  );
}

function getMinAgeDays(request: HttpRequest): number | null {
  const value = request.query.get("minAgeDays");

  if (!value) {
    return DEFAULT_MIN_AGE_DAYS;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > 365
  ) {
    return null;
  }

  return parsed;
}

async function loadReferencedBlobNames(
  storage: StorageContext,
): Promise<Set<string>> {
  const pool = await getSqlPool();

  const result = await pool.request()
    .query<PropertyImageUrlRow>(`
      SELECT image_url
      FROM dbo.property_images
      WHERE
        image_url IS NOT NULL
        AND LTRIM(RTRIM(image_url)) <> '';
    `);

  const referencedBlobNames = new Set<string>();

  for (const row of result.recordset) {
    const blobName = extractBlobNameFromUrl(
      row.image_url,
      storage,
    );

    if (blobName) {
      referencedBlobNames.add(blobName);
    }
  }

  return referencedBlobNames;
}

export async function getManagementPropertyImageCleanup(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const minAgeDays = getMinAgeDays(request);

  if (minAgeDays === null) {
    return {
      status: 400,
      jsonBody: {
        message:
          "minAgeDaysは1～365の整数で指定してください。",
      },
    };
  }

  try {
    const storage = getStorageContext();

    const referencedBlobNames =
      await loadReferencedBlobNames(storage);

    const candidates: CleanupCandidate[] = [];

    let scannedBlobCount = 0;
    let referencedBlobCount = 0;
    let recentUnreferencedCount = 0;
    let candidateTotalSize = 0;

    for await (
      const blob of storage.containerClient.listBlobsFlat()
    ) {
      scannedBlobCount += 1;

      if (referencedBlobNames.has(blob.name)) {
        referencedBlobCount += 1;
        continue;
      }

      const lastModified = blob.properties.lastModified;

      if (!lastModified) {
        recentUnreferencedCount += 1;
        continue;
      }

      const ageDays = calculateAgeDays(lastModified);

      if (ageDays < minAgeDays) {
        recentUnreferencedCount += 1;
        continue;
      }

      const size = blob.properties.contentLength ?? 0;

      candidateTotalSize += size;

      candidates.push({
        blobName: blob.name,
        imageUrl: buildPublicImageUrl(
          storage,
          blob.name,
        ),
        contentType:
          blob.properties.contentType ?? null,
        size,
        lastModified: lastModified.toISOString(),
        ageDays,
      });
    }

    candidates.sort((a, b) => {
      return (
        new Date(a.lastModified).getTime() -
        new Date(b.lastModified).getTime()
      );
    });

    return {
      status: 200,
      jsonBody: {
        dryRun: true,
        containerName: storage.containerName,
        minAgeDays,
        scannedBlobCount,
        referencedBlobCount,
        recentUnreferencedCount,
        candidateCount: candidates.length,
        candidateTotalSize,
        candidates,
      },
    };
  } catch (error: unknown) {
    context.error(
      "Failed to scan unused property images.",
      error,
    );

    return {
      status: 500,
      jsonBody: {
        message:
          "未使用画像の確認に失敗しました。",
      },
    };
  }
}

export async function deleteManagementPropertyImageCleanup(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body: unknown = await request.json();
    const parsed = cleanupRequestSchema.safeParse(body);

    if (!parsed.success) {
      return {
        status: 400,
        jsonBody: {
          message:
            "削除対象または確認情報が正しくありません。",
          errors: parsed.error.flatten(),
        },
      };
    }

    const storage = getStorageContext();
    const input = parsed.data;

    /*
     * dry-run後に画像がDBへ登録された可能性を考慮し、
     * POST受信時点の最新DB状態を再取得する。
     */
    const referencedBlobNames =
      await loadReferencedBlobNames(storage);

    const uniqueBlobNames = [
      ...new Set(input.blobNames),
    ];

    const results: CleanupResult[] = [];

    for (const blobName of uniqueBlobNames) {
      if (!isSafeBlobName(blobName)) {
        results.push({
          blobName,
          status: "skipped",
          reason: "invalid_blob_name",
        });
        continue;
      }

      if (referencedBlobNames.has(blobName)) {
        results.push({
          blobName,
          status: "skipped",
          reason: "referenced",
        });
        continue;
      }

      const blobClient =
        storage.containerClient.getBlockBlobClient(
          blobName,
        );

      try {
        const exists = await blobClient.exists();

        if (!exists) {
          results.push({
            blobName,
            status: "skipped",
            reason: "not_found",
          });
          continue;
        }

        const properties =
          await blobClient.getProperties();

        const lastModified = properties.lastModified;

        if (!lastModified) {
          results.push({
            blobName,
            status: "skipped",
            reason: "missing_last_modified",
          });
          continue;
        }

        const ageDays =
          calculateAgeDays(lastModified);

        if (ageDays < input.minAgeDays) {
          results.push({
            blobName,
            status: "skipped",
            reason: "too_recent",
          });
          continue;
        }

        const deleteResult =
          await blobClient.deleteIfExists({
            deleteSnapshots: "include",
          });

        if (!deleteResult.succeeded) {
          results.push({
            blobName,
            status: "skipped",
            reason: "not_found",
          });
          continue;
        }

        results.push({
          blobName,
          status: "deleted",
        });
      } catch (error: unknown) {
        context.error(
          `Failed to delete unused property image: ${blobName}`,
          error,
        );

        results.push({
          blobName,
          status: "failed",
          reason: "delete_failed",
        });
      }
    }

    const deletedCount = results.filter(
      (result) => result.status === "deleted",
    ).length;

    const skippedCount = results.filter(
      (result) => result.status === "skipped",
    ).length;

    const failedCount = results.filter(
      (result) => result.status === "failed",
    ).length;

    context.log(
      "Property image cleanup completed.",
      {
        requestedCount: uniqueBlobNames.length,
        deletedCount,
        skippedCount,
        failedCount,
      },
    );

    return {
      status: 200,
      jsonBody: {
        minAgeDays: input.minAgeDays,
        requestedCount: uniqueBlobNames.length,
        deletedCount,
        skippedCount,
        failedCount,
        results,
      },
    };
  } catch (error: unknown) {
    context.error(
      "Failed to delete unused property images.",
      error,
    );

    return {
      status: 500,
      jsonBody: {
        message:
          "未使用画像の削除に失敗しました。",
      },
    };
  }
}

app.http("management-property-images-cleanup-get", {
  methods: ["GET"],
  authLevel: "function",
  route: "management/property-images/cleanup",
  handler: getManagementPropertyImageCleanup,
});

app.http("management-property-images-cleanup-post", {
  methods: ["POST"],
  authLevel: "function",
  route: "management/property-images/cleanup",
  handler: deleteManagementPropertyImageCleanup,
});
