/** The questions the home page and the guide both answer, in the same words */
export interface FaqItem {
  q: string
  a: string
}

export const FAQ: FaqItem[] = [
  {
    q: 'Can the pool creator take my coins?',
    a: 'No. Dash consensus only ever refunds your principal to the refund address you set when you take a share, and pays your rewards to your reward address. The creator holds the operator and voting keys, which can run the node and vote, but can’t move coins. Changing either key takes every member’s signature.'
  },
  {
    q: 'What if a member never signs?',
    a: 'The pool stays in Signing and never registers. Your coins never leave your wallet, because the registration needs every member’s signature. The creator can’t re-lock the pool; they create a new one instead.'
  },
  {
    q: 'Can I spend my coins after taking a share?',
    a: 'Technically yes, but then the registration transaction becomes invalid and the pool can never form. Keep your UTXOs unspent until the masternode registers. Creators can ban members who do this.'
  },
  {
    q: 'What does the early exit penalty do?',
    a: 'During the early period after registration, a member who dissolves alone pays the penalty, which is shared by the other members. It protects everyone from a member leaving right after the node starts. After the early period, leaving is free. A pool with no penalty lets anyone leave at any time.'
  },
  {
    q: 'What happens if the node gets PoSe-banned?',
    a: 'The masternode stops earning and the pool shows Error. Your coins are safe. The operator fixes the server and sends a ProUpServTx to bring it back. If they don’t, any member can dissolve.'
  },
  {
    q: 'Is the chat private?',
    a: 'There is one chat per pool, and it is public: messages are readable by anyone, forever, and anyone can see who posted and when. Don’t post secrets. A private, member-only chat is not part of this version.'
  },
  {
    q: 'Can I change my reward address later?',
    a: 'The protocol supports it (ProUpShareTx). This app will add it in a later version. Your refund address can never change.'
  },
  {
    q: 'Does this app have a server?',
    a: 'No. It reads and writes Dash Platform documents and chain data through DAPI, the network’s own API. You can download it and run it locally.'
  }
]