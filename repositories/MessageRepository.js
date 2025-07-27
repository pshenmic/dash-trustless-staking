import bs58 from "bs58";
import { APP_NAME } from "../constants.js";
import Message from "../models/Message.js";
import logger from "../logger.js";
import config from "../config.js";
import UserNotInPoolError from "../errors/UserNotInPoolError.js";

class MessageRepository {
  #docName = 'message';

  /**
   * @param {DashPlatformSDK} sdk - SDK instance for Dash platform
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

    // Decode poolId from Base58 to Buffer
    const poolIdBuffer = bs58.decode(channel);

    // Fetch UTXO documents for this pool
    const collateralDocs = await this.sdk.documents.query(
        config.contractId,
        'collateral',
        [['poolId', '==', poolIdBuffer]],
        null,
  )


    // Get the identity object for current user
    const identity = await this.sdk.identities.getIdentityByIdentifier(config.identity);
    const myId = identity.id;

    // Check if any UTXO document owner matches current identity
    const isMember = collateralDocs.some((doc) => doc.getOwnerId().equals(myId));

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

    // Query last 10 messages, sorted by createdAt descending
    const messageDocs = await this.sdk.documents.query(
        config.contractId,
        this.#docName,
        [["channel", "==", channel]],
        null,
        10,
    )

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

    const identityContractNonce = await this.sdk.identities.getIdentityContractNonce(
        config.identity,
        config.contractId,
    );

    const msgDoc = await this.sdk.documents.create(
        config.contractId,
        this.#docName,
        { channel, text },
        config.identity,
    );

    const stateTransition = await this.sdk.documents.createStateTransition(
        msgDoc,
        'create',
        identityContractNonce + 1n,
    );

    await signStateTransition(stateTransition, this.sdk);

    logger.log("Broadcasting Message Document");
    await this.sdk.stateTransitions.broadcast(stateTransition);
    logger.log("Done..", `Message Document at: ${msgDoc.id.base58()}`);

    return Message.fromDocument(msgDoc);
  }
}

export default MessageRepository;
