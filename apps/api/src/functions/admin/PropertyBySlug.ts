import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { sql, getSqlPool } from "../../lib/sql";
import { getFeatureIdsByPropertyId } from "../../lib/property-features";

function mapManagementProperty(row: any) {
  return {
    id: row.id,
    slug: row.slug,
    propertyNumber: row.property_number,
    title: row.title,

    priceType: row.price_type,
    price: row.price === null ? null : Number(row.price),

    status: row.status,
    prefecture: row.prefecture,
    city: row.city,
    address: row.address,
    description: row.description,

    propertyType: row.property_type,
    transactionType: row.transaction_type,

    landAreaSqm: row.land_area_sqm === null ? null : Number(row.land_area_sqm),
    buildingAreaSqm: row.building_area_sqm === null ? null : Number(row.building_area_sqm),
    layout: row.layout,

    accessInfo: row.access_info,
    builtYear: row.built_year,
    builtMonth: row.built_month,

    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),

    landCategory: row.land_category,
    cityPlanningArea: row.city_planning_area,
    zoningDistrict: row.zoning_district,
    buildingCoverageRatio:
      row.building_coverage_ratio === null ? null : Number(row.building_coverage_ratio),
    floorAreaRatio: row.floor_area_ratio === null ? null : Number(row.floor_area_ratio),
    roadAccess: row.road_access,

    buildingStructure: row.building_structure,
    buildingFloors: row.building_floors,
    parking: row.parking,

    currentStatus: row.current_status,
    handoverTiming: row.handover_timing,
    facilities: row.facilities,
    remarks: row.remarks,

    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    images: row.images ?? [],
  };
}

export async function getManagementPropertyBySlug(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const slug = request.params.slug;

  if (!slug) {
    return {
      status: 400,
      jsonBody: {
        message: "Slug is required.",
      },
    };
  }

  try {
    const pool = await getSqlPool();

    const result = await pool.request()
      .input("slug", sql.NVarChar, slug)
      .query(`
        SELECT TOP 1
          id,
          slug,
          property_number,
          title,
          price_type,
          price,
          status,
          prefecture,
          city,
          address,
          description,
          property_type,
          transaction_type,
          land_area_sqm,
          building_area_sqm,
          layout,
          access_info,
          built_year,
          built_month,
          latitude,
          longitude,

          land_category,
          city_planning_area,
          zoning_district,
          building_coverage_ratio,
          floor_area_ratio,
          road_access,

          building_structure,
          building_floors,
          parking,

          current_status,
          handover_timing,
          facilities,
          remarks,

          published_at,
          updated_at
        FROM dbo.properties
        WHERE slug = @slug;
      `);

    if (result.recordset.length === 0) {
      return {
        status: 404,
        jsonBody: {
          message: "Property not found.",
        },
      };
    }

    const property = mapManagementProperty(result.recordset[0]);
    const featureIds = await getFeatureIdsByPropertyId(pool, property.id);

    return {
      status: 200,
      jsonBody: {
        ...property,
        featureIds,
      },
    };
  } catch (error) {
    context.error("getManagementPropertyBySlug failed", error);

    return {
      status: 500,
      jsonBody: {
        message: "Failed to fetch property.",
      },
    };
  }
}

app.http("management-properties-get-by-slug", {
  methods: ["GET"],
  authLevel: "function",
  route: "management/properties/{slug}",
  handler: getManagementPropertyBySlug,
});