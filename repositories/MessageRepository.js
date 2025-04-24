import Dash from "dash";
import bs58 from "bs58";
import { APP_NAME } from "../constants.js";
import Message from "../models/Message.js";
import logger from "../logger.js";
import config from "../config.js";
import UserNotInPoolError from "../errors/UserNotInPoolError.js";

const Client = Dash.Client;

class MessageRepository {
  #docName = 'message';

  /**
   * @param {Client} sdk - SDK instance for Dash platform
   */
  constructor(sdk) {
    this.sdk = sdk;
  }

  /**
   * Ensure that the current identity has at least one UTXO in the pool.
   *
   * @param {string} channel - Channel ID (poolId or 'global')
   * @throws {UserNotInPoolError} if user is not a member of the pool
   */
  async _ensureMembership(channel) {
    // Skip membership check for global channel
    if (channel === 'global') {
      return;
    }

    const { platform } = this.sdk;

    // Decode poolId from Base58 to Buffer
    const poolIdBuffer = bs58.decode(channel);

    // Fetch UTXO documents for this pool
    const utxoDocs = await platform.documents.get(
      `${APP_NAME}.utxo`,
      { where: [['poolId', '==', poolIdBuffer]] },
    );

    // Get the identity object for current user
    const identity = await platform.identities.get(config.identity);
    const myId = identity.getId();

    // Check if any UTXO document owner matches current identity
    const isMember = utxoDocs.some((doc) => doc.getOwnerId().equals(myId));

    if (!isMember) {
      throw new UserNotInPoolError(channel);
    }
  }

  /**
   * Fetches the last 10 messages from a channel, in chronological order.
   *
   * @param {string} channel - Channel ID: 'global' or poolId.
   * @returns {Promise<Message[]>}
   * @throws {UserNotInPoolError}
   */
  async get(channel) {
    // Verify pool membership
    await this._ensureMembership(channel);

    const { platform } = this.sdk;

    // Query last 10 messages, sorted by createdAt descending
    const messageDocs = await platform.documents.get(
      `${APP_NAME}.${this.#docName}`,
      {
        where: [['channel', '==', channel]],
        orderBy: [['$createdAt', 'desc']],
        limit: 10,
      },
    );

    // Reverse to chronological order (oldest → newest)
    const chronological = messageDocs.reverse();

    // Map to domain model
    return chronological.map((doc) => Message.fromDocument(doc));
  }

  /**
   * Sends a new message to a specified channel.
   *
   * @param {string} channel - Channel ID: 'global' or poolId.
   * @param {string} text - Chat message text.
   * @returns {Promise<Message>}
   * @throws {UserNotInPoolError}
   */
  async send(channel, text) {
    // Verify pool membership
    await this._ensureMembership(channel);

    logger.info(`Sending message to channel: ${channel}`);

    const { platform } = this.sdk;
    // Get identity for signing the document
    const identity = await platform.identities.get(config.identity);

    // Create the message document
    const msgDoc = await platform.documents.create(
      `${APP_NAME}.${this.#docName}`,
      identity,
      { channel, text },
    );

    // Broadcast the new document
    const batch = {
      create: [msgDoc],
      replace: [],
      delete: [],
    };
    logger.log("Broadcasting Message Document");
    await platform.documents.broadcast(batch, identity);
    logger.log("Done..", `Message Document at: ${msgDoc.getId()}`);

    return Message.fromDocument(msgDoc);
  }
}

export default MessageRepository;
