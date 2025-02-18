import Dash from "dash";
import config from "./config.js";
import logger from "./logger.js";
import {APP_NAME} from "./constants.js";

const Client = Dash.Client;

/**
 * Pushes a new document to the platform and broadcasts it.
 *
 * This function creates a document using the provided data and pushes it to the Dash platform,
 * then broadcasts the document to the network. The function requires an SDK instance, a document name,
 * and the document data. It also validates that these parameters are provided.
 *
 * @param {Client} sdk - The SDK instance used for interacting with the Dash platform.
 * @param {string} documentName - The name of the document to be created.
 * @param {Object} documentData - The data to be included in the document.
 *
 * @throws {Error} If any of the required parameters (sdk, documentName, or documentData) are not provided.
 *
 * @returns {Promise<Object>} The created document object, after it is broadcasted.
 */
export async function pushDocument(sdk, documentName, documentData) {
  const { platform } = sdk;

  const identity = await platform.identities.get(config.identity);

  const document = await sdk.platform.documents.create(
    `${APP_NAME}.${documentName}`,
    identity,
    {...documentData, createdAt: undefined, updatedAt: undefined},
  )

  const documentBatch = {
    create: [document],
    replace: [],
    delete: [],
  };

  logger.log("Broadcasting Document");
  await platform.documents.broadcast(documentBatch, identity);
  logger.log("Done", "\n", `Document at: ${document.getId()}`);

  return document;
}

/**
 * Retrieves a document from the Dash platform by its ID.
 *
 * This function fetches a document from the Dash platform using the provided SDK instance,
 * document name, and document ID. It validates the parameters and queries the platform for
 * the document with the given ID. If any required parameter is missing, an error is thrown.
 *
 * @param {Client} sdk - The SDK instance used for interacting with the Dash platform.
 * @param {string} documentName - The name of the document type to be fetched.
 * @param {string} documentId - The unique identifier of the document to be retrieved.
 *
 * @throws {Error} If any of the required parameters (sdk, documentName, or documentId) are not provided.
 *
 * @returns {Promise<Object>} A promise that resolves to the document object retrieved from the platform.
 */
export async function getDocumentById(sdk,documentName, documentId) {
  const { platform } = sdk;

  return platform.documents.get(
    `${APP_NAME}.${documentName}`,
    {where: [['$id', '==', documentId]] },
  );
}
