import type { Detector, ScanContext } from "../types.js";

export const apiDocsDetector: Detector = {
  name: "api-docs",
  category: "config",

  async detect(ctx: ScanContext): Promise<Record<string, unknown>> {
    const [openApiSpecs, graphqlSchemas, grpcProtos, postmanCollections] = await Promise.all([
      detectOpenAPI(ctx),
      detectGraphQL(ctx),
      detectGRPC(ctx),
      detectPostmanCollections(ctx),
    ]);

    return {
      openapi: openApiSpecs,
      graphql: graphqlSchemas,
      grpc: grpcProtos,
      postman: postmanCollections,
    };
  },
};

async function detectOpenAPI(ctx: ScanContext): Promise<OpenAPIData | null> {
  const openApiFiles = [
    "openapi.json",
    "openapi.yaml",
    "openapi.yml",
    "swagger.json",
    "swagger.yaml",
    "swagger.yml",
    "api-specs/openapi.json",
    "api-specs/openapi.yaml",
    "docs/openapi.json",
    "docs/openapi.yaml",
    "spec/openapi.json",
    "spec/openapi.yaml",
    "api/openapi.json",
    "api/openapi.yaml",
  ];

  for (const file of openApiFiles) {
    if (ctx.fileExists(file)) {
      const content = await ctx.readFile(file);
      if (content) {
        try {
          const spec = JSON.parse(content);
          if (spec.openapi || spec.swagger) {
            return {
              version: spec.openapi || spec.swagger,
              title: spec.info?.title || null,
              file: file,
              type: spec.openapi ? "openapi" : "swagger",
            };
          }
        } catch {
          // Try YAML
          if (content.includes("openapi:") || content.includes("swagger:")) {
            return {
              version: extractYAMLField(content, "openapi") || extractYAMLField(content, "swagger"),
              title: extractYAMLField(content, "title"),
              file: file,
              type: content.includes("openapi:") ? "openapi" : "swagger",
            };
          }
        }
      }
    }
  }

  return null;
}

async function detectGraphQL(ctx: ScanContext): Promise<GraphQLData | null> {
  const graphqlFiles = ctx.files.filter(
    (f) =>
      f.endsWith(".graphql") ||
      f.endsWith(".gql") ||
      f.includes("/graphql/") ||
      f.includes("/schema/")
  );

  if (graphqlFiles.length === 0) {
    return null;
  }

  const schemas: string[] = [];
  const resolvers: string[] = [];

  for (const file of graphqlFiles) {
    const content = await ctx.readFile(file);
    if (!content) {
      continue;
    }

    if (
      content.includes("type Query") ||
      content.includes("type Mutation") ||
      content.includes("type Subscription")
    ) {
      schemas.push(file);
    }
    if (
      content.includes("Query:") ||
      content.includes("Mutation:") ||
      content.includes("resolver")
    ) {
      resolvers.push(file);
    }
  }

  if (schemas.length === 0 && resolvers.length === 0) {
    return null;
  }

  return {
    schema_files: schemas,
    resolver_files: resolvers,
    total_files: graphqlFiles.length,
  };
}

async function detectGRPC(ctx: ScanContext): Promise<GRPCData | null> {
  const protoFiles = ctx.files.filter((f) => f.endsWith(".proto"));

  if (protoFiles.length === 0) {
    return null;
  }

  const services: string[] = [];

  for (const file of protoFiles) {
    const content = await ctx.readFile(file);
    if (!content) {
      continue;
    }

    if (content.includes("service ")) {
      services.push(file);
    }
  }

  return {
    proto_files: protoFiles,
    service_definitions: services,
  };
}

async function detectPostmanCollections(ctx: ScanContext): Promise<PostmanData | null> {
  const postmanFiles = ctx.files.filter(
    (f) => f.includes("postman") && (f.endsWith(".json") || f.endsWith(".json.backup"))
  );

  if (postmanFiles.length === 0) {
    return null;
  }

  const collections: Array<{ file: string; name: string | null }> = [];

  for (const file of postmanFiles) {
    const content = await ctx.readFile(file);
    if (!content) {
      continue;
    }

    try {
      const json = JSON.parse(content);
      if (json.info?.schema?.includes("postman")) {
        collections.push({
          file: file,
          name: (json.info?.name as string | undefined) || null,
        });
      }
    } catch {}
  }

  if (collections.length === 0) {
    return null;
  }

  return {
    collections: collections,
  };
}

function extractYAMLField(content: string, field: string): string | null {
  const regex = new RegExp(`^${field}:\\s*(.+)$`, "m");
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

interface OpenAPIData {
  version: string | null;
  title: string | null;
  file: string;
  type: "openapi" | "swagger";
}

interface GraphQLData {
  schema_files: string[];
  resolver_files: string[];
  total_files: number;
}

interface GRPCData {
  proto_files: string[];
  service_definitions: string[];
}

interface PostmanData {
  collections: Array<{ file: string; name: string | null }>;
}
