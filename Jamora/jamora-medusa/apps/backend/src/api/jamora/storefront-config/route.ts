import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils";

type PublishableApiKey = {
  id: string;
  title: string;
  token: string;
  type: string;
  revoked_at: string | null;
  created_at: string;
};

const JAMORA_STOREFRONT_KEY_TITLE = "Jamora Storefront Key";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const remoteQuery = req.scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY);
  const queryObject = remoteQueryObjectFromString({
    entryPoint: "api_key",
    variables: {
      filters: { type: "publishable" },
      skip: 0,
      take: 100,
    },
    fields: ["id", "title", "token", "type", "revoked_at", "created_at"],
  });

  const { rows } = await remoteQuery(queryObject);
  const activeKeys = (rows as PublishableApiKey[]).filter(
    (key) => key.token && !key.revoked_at
  );
  const key =
    activeKeys.find((apiKey) => apiKey.title === JAMORA_STOREFRONT_KEY_TITLE) ??
    activeKeys[0];

  if (!key) {
    return res.status(404).json({ publishableKey: null });
  }

  return res.json({ publishableKey: key.token });
}
