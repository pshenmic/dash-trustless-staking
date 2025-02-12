import config from "./config.js";
import logger from "./logger.js";

/**
 * Pushes a new document to the platform and broadcasts it.
 *
 * This function creates a document using the provided data and pushes it to the Dash platform,
 * then broadcasts the document to the network. The function requires an SDK instance, a document name,
 * and the document data. It also validates that these parameters are provided.
 *
 * @param {Object} sdk - The SDK instance used for interacting with the Dash platform.
 * @param {string} documentName - The name of the document to be created.
 * @param {Object} documentData - The data to be included in the document.
 *
 * @throws {Error} If any of the required parameters (sdk, documentName, or documentData) are not provided.
 *
 * @returns {Promise<Object>} The created document object, after it is broadcasted.
 */
export async function pushDocument(sdk, documentName, documentData) {
  if (!sdk) {
    throw new Error("No sdk specified");
  }
  if (!documentName) {
    throw new Error("No documentName specified");
  }
  if (!documentData) {
    throw new Error("No documentData specified");
  }

  const { platform } = sdk;

  const identity = await platform.identities.get(config.identity);

  const document = await sdk.platform.documents.create(
    `TrustlessPooledStaking.${documentName}`,
    identity,
    {...documentData, createdAt: undefined, updatedAt: undefined},
  )

  const documentBatch = {
    create: [document],
    replace: [],
    delete: [],
  };

  logger.log("Broadcasting Document");
  await sdk.platform.documents.broadcast(documentBatch, identity);
  logger.log("Done", "\n", `Document at: ${document.getId()}`);

  return document;
}
