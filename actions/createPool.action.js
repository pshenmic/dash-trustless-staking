import {pushDocument} from "../utils/pushDocument.util.js";
import logger from "../logger.js";

function createPoolAction(name, description, type,) {

  const status = "INACTIVE"

  if (!['MASTERNODE', 'EVONODE'].includes(type)) {
    logger.error("Invalid pool type. Valid types are 'MASTERNODE' or 'EVONODE'.");
    return;
  }

  logger.log(`Creating pool:
    Name: ${name}
    Description: ${description}
    Type: ${type}
    Status: ${status}
  `);

  createPool(name, description, type, status);
}

async function createPool(name, description, type, status) {
  const docName = 'pools';
  const docData = {
    name,
    description,
    type,
    status,
  }
  await pushDocument(docName, docData);
}

export default createPoolAction;
