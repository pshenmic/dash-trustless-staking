## Installing Dependencies

1. First, make sure that you have Node.js installed. If not, download and install it from the official website: [https://nodejs.org/](https://nodejs.org/).

2. Install the required dependencies by running the following command:

```bash
npm install pshenmic/dash-trustless-staking
```

3. After installing, you can use the commands for creating a pool, retrieving pool information, and joining the pool as shown in the examples below.

---

## Example Usage:

### Creating a Pool

Execute the following command to create a pool:

```bash
dash-trustless-staking pool create MyPool PoolDescription MASTERNODE
```

Expected output:

```
Done.. Pool Document at: Ayy5WaUNndpZxya2fG3d5EfPHF1kjDxoHnBceg9xt7zu
```

**Important:**  
Save the pool document address:  
`Ayy5WaUNndpZxya2fG3d5EfPHF1kjDxoHnBceg9xt7zu`

This address will be required later for joining the pool or retrieving pool information.

---

### Retrieving Pool Information

To view the details of the created pool, run the following command:

```bash
dash-trustless-staking pool get Ayy5WaUNndpZxya2fG3d5EfPHF1kjDxoHnBceg9xt7zu
```

Expected output:

```
Fetched pool document:
{
  "name": "MyPool",
  "description": "PoolDescription",
  "type": "MASTERNODE",
  "status": "INACTIVE",
  "createdAt": 1743606404708,
  "updatedAt": 1743606404708
}
[2025-04-03T18:09:15.069Z] [INFO]: Pool Info:
{
  "totalMembers": 0,
  "balance": 0,
  "membersInfo": []
}
```

---

### Joining the Pool

Participants who want to join the pool should execute the following command:

```bash
dash-trustless-staking pool join Ayy5WaUNndpZxya2fG3d5EfPHF1kjDxoHnBceg9xt7zu <utxo_hash> <utxo_vout>
```

Replace `<utxo_hash>` with the UTXO transaction hash and `<utxo_vout>` with the corresponding output index that you want to use as collateral.

---

This instruction should be clear enough to get started with using the `dash-trustless-staking` tool.
