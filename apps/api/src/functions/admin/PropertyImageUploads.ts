import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";

const DEFAULT_CONTAINER_NAME = "property-images";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const extensionByContentType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
};

const sanitizeFileName = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const createBlobName = (originalFileName: string, contentType: string): string => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");

  const safeName = sanitizeFileName(originalFileName);
  const extension = extensionByContentType[contentType] ?? "bin";
  const randomId = crypto.randomUUID();

  return `${yyyy}/${mm}/${dd}/${randomId}-${safeName || `property-image.${extension}`}`;
};

const getPublicImageUrl = (containerName: string, blobName: string): string => {
  const publicBaseUrl = process.env.PROPERTY_IMAGES_PUBLIC_BASE_URL;

  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/+$/g, "")}/${blobName}`;
  }

  const connectionString = getRequiredEnv("AZURE_STORAGE_CONNECTION_STRING");
  const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
  const accountName = accountNameMatch?.[1];

  if (!accountName) {
    throw new Error("Could not detect storage account name from AZURE_STORAGE_CONNECTION_STRING.");
  }

  return `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`;
};

export async function uploadManagementPropertyImage(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
      return {
        status: 400,
        jsonBody: {
          message: "画像ファイルを選択してください。",
        },
      };
    }

    const uploadedFile = file as File;
    const contentType = uploadedFile.type;

    if (!allowedContentTypes.has(contentType)) {
      return {
        status: 400,
        jsonBody: {
          message: "アップロードできる画像形式は jpg / png / webp です。",
        },
      };
    }

    if (uploadedFile.size > MAX_FILE_SIZE_BYTES) {
      return {
        status: 400,
        jsonBody: {
          message: "画像サイズは5MB以下にしてください。",
        },
      };
    }

    const connectionString = getRequiredEnv("AZURE_STORAGE_CONNECTION_STRING");
    const containerName =
      process.env.PROPERTY_IMAGES_CONTAINER_NAME ?? DEFAULT_CONTAINER_NAME;

    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    const containerClient =
      blobServiceClient.getContainerClient(containerName);

    await containerClient.createIfNotExists({
      access: "blob",
    });

    const blobName = createBlobName(uploadedFile.name, contentType);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const buffer = Buffer.from(await uploadedFile.arrayBuffer());

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
    });

    const imageUrl = getPublicImageUrl(containerName, blobName);

    return {
      status: 201,
      jsonBody: {
        imageUrl,
        blobName,
        contentType,
        size: uploadedFile.size,
      },
    };
  } catch (error: unknown) {
    context.error("Failed to upload property image.", error);

    return {
      status: 500,
      jsonBody: {
        message: "画像アップロードに失敗しました。",
      },
    };
  }
}

app.http("management-property-image-upload", {
  methods: ["POST"],
  authLevel: "function",
  route: "management/property-images/upload",
  handler: uploadManagementPropertyImage,
});
