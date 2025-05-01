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
   * @param {Document} doc - Document returned by Dash SDK.
   * @returns {Message}
   */
  static fromDocument(doc) {
    const data = doc.toJSON();

    return new Message(
      data.channel,
      data.text,
      data['$createdAt'],
      data['$updatedAt'],
    );
  }
}

export default Message;
