# Dash Pooled Trustless Staking 

Decentralized trustless shared masternode solution based on the Dash Platform.

The concept of Dash Trustless Staking DApp, is to create a simple application
for a users to start investing in the Dash Masternodes in a Trustless and
Decentralized way. The idea behind, is to gather people together in “pools”
where they can stake Dash together.

It utilises Dash Platform blockchain together with multisig transactions, forming
a yet another level of governance inside Dash DAO. For node register, withdrawal
and voting happens by the quorum of the all members (the necessary sig power
defined on pool creation).

As an example, let’s say you want to join the pool and start earning masternode
rewards. Upon join, you apply an UTXO from your local wallet, that you are going
to use as a collateral (it maybe any amount less than 1000 DASH). After pool is
filled with necessary amount to register a node, an unsigned transaction gets
created and broadcasted to each member of the pool. After all participant signs
and shares with others their parts of the signature, final transaction could be
constructed and broadcasted in the Dash Core network.

The same way we can achieve governance on the Core & Platform layer, which
I believe would attract people into voting.


# How to use

The application is in ongoing development. Currently, we have implemented 4 commands:

* Pool creation
* Get Pool by ID
* Join Pool
* Top Up Identity (utility)

To use them, do `npm install`, and then you can pass a commands through `node index`

Example:
```
node index <command> 
```

### Create Pool:
To create pool, you provide pool name, description and masternode type

```
node index.js pool create MyPool PoolDescription MASTERNODE
```

### Get Pool By ID:
To retrieve info about the pool, simply query it by identifier

```
node index.js pool get 8uff2sddkV889RW5xgYYGP7GskCFdh5MN3opC3DLJnwF
```

### Top Up Identity:
Top up identity, simply provide amount of credits to top up in duffs (satoshi)
```
node index.js identity topup 10000
```

### Join Pool:
To join pool, you provide a Pool ID, and your UTXO that you want to use as a collateral
```
node index.js pool join 8uff2sddkV889RW5xgYYGP7GskCFdh5MN3opC3DLJnwF fd479cef4ca559aea4c22758196963a850c8de44895baf4e257988642727eb4a 1
```
