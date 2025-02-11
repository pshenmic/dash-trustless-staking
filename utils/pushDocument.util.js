import {getIdentity} from "./getIdentity.util.js";
import initClient from "../initClient.js";

export async function pushDocument(documentName, documentData) {

  if (!documentName) {
    throw new Error("Document name is required");
  }

  if (!documentData) {
    throw new Error("Document data is required");
  }

  const client = initClient();
  const { platform } = client;

  const identity = await platform.identities.get(getIdentity());

  const document = await client.platform.documents.create(
    `TrustlessPoolStaking.${documentName}`,
    identity,
    documentData
  );

  const documentBatch = {
    create: [document],
    replace: [],
    delete: [],
  };

  console.log("Broadcasting Document");
  await client.platform.documents.broadcast(documentBatch, identity);

  console.log("Done", "\n", `Document at: ${document.getId()}`);

  return document;

}
