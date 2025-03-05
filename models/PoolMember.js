/**
 * Class representing a PoolMember
 */
class PoolMember {
  /**
   * Creates an instance of PoolMember.
   *
   * @param {string} identity - The ID of the pool where the UTXO is associated.
   * @param {number} balance - The unique hash of the UTXO.
   */
  constructor(identity, balance) {
    this.identity = identity;
    this.balance = balance;
  }
}

export default PoolMember;
