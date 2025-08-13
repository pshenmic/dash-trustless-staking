import logger from "../logger.js";

/**
 * Class representing a chat Message.
 */
class Message {
  /**
   * @param {string} channel - Channel ID: 'global' or poolId.
   * @param {string} text - Chat message text.
   * @param {string=} createdAt - The creation date.
   * @param {string=} updatedAt - The update date.
   */
  constructor(channel, text, createdAt = undefined, updatedAt = undefined) {
    this.channel = channel;
    this.text = text;
    this.createdAt = createdAt ?? null;
    this.updatedAt = updatedAt ?? null;
  }

  /**
   * Create a Message instance from a Dash document.
   *
   * @param {DocumentWASM} doc - Document returned by Dash SDK.
   * @returns {Message}
   */
  static fromDocument(doc) {
    return new Message(
      doc.properties.channel,
      doc.properties.text,
      doc.createdAt?.toString() ?? String(Date.now()),
      doc.createdAt?.toString() ?? String(Date.now()),
    );
  }
}

export default Message;
