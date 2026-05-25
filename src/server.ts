#!/usr/bin/env node
// sen2 — agent-to-agent encrypted messaging on Solana via MCP (M3)
//
// Tools:
//   sen2_whoami       — return this agent's address + devnet balance
//   sen2_send         — encrypt + send a memo to a recipient
//   sen2_inbox        — scan + decrypt recent traffic
//   sen2_conversation — same as inbox, filtered to one peer
//
// Identity comes from the OS keychain via wallet/keystore. The account label
// defaults to "default"; override with the SEN2_ACCOUNT env var.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { address as toAddress, getAddressDecoder, getAddressEncoder, type Address } from "@solana/kit";
import { z } from "zod";

import { config } from "./config.js";
import { MAX_PLAINTEXT_BYTES, encryptMessage } from "./crypto/envelope.js";
import { isSolName, lookupPrimaryDomains, resolveSol } from "./sns/resolve.js";
import { getRpc, getRpcSubscriptions } from "./solana/rpc.js";
import { sendEncryptedMemoTx } from "./solana/send.js";
import { type InboxMessage, scanInbox } from "./solana/inbox.js";
import { loadOrGenerate } from "./wallet/keystore.js";
import { toSolanaSigner } from "./wallet/signer.js";

const me = loadOrGenerate(config.account);
const decoder = getAddressDecoder();
const encoder = getAddressEncoder();
const myAddress = decoder.decode(me.publicKey);

const rpc = getRpc();
const rpcSubs = getRpcSubscriptions();

// Below this the wallet can't even cover the ~5,000-lamport transaction fee.
const MIN_SEND_LAMPORTS = 5000n;

console.error(
  `[sen2 ${config.version}] cluster=${config.cluster} account=${config.account} rpc=${config.rpc.http} sns=${config.rpc.sns}`,
);
if (config.cluster === "mainnet-beta") {
  console.error(
    "[sen2] ⚠ MAINNET active — sends spend REAL SOL and are permanent and publicly visible. " +
      "Back up your key now with `sen2 export`.",
  );
}

const server = new McpServer(
  { name: "sen2", version: config.version },
  {
    instructions:
      "sen2 sends and receives end-to-end encrypted messages between agents on Solana. " +
      "Use sen2 tools whenever the user wants to: (a) send, message, DM, tell, contact, " +
      "or share content with another agent identified by a Solana address; (b) check their " +
      "own inbox or recent messages; (c) view the conversation thread with a specific peer; " +
      "or (d) discover their own agent address to share with others. " +
      "Recipients can be either a base58 Solana address (32-byte Ed25519 public key) " +
      "OR a `.sol` SNS name (e.g. 'alice.sol'). SNS names are resolved against mainnet-beta " +
      "regardless of the current messaging cluster. If the user names an agent without " +
      "providing either, ask for one. " +
      "Do NOT use sen2 for email, Slack, SMS, or any non-Solana channel.",
  },
);

server.registerTool(
  "sen2_whoami",
  {
    title: "sen2 whoami",
    description:
      "Return this agent's sen2 identity, for sharing with peers. " +
      "USE WHEN the user asks any of: 'what is my address?', 'who am I on sen2?', " +
      "'what's my agent ID?', 'what's my sen2 address?', or wants to share their " +
      "address so another agent can message them. " +
      "Returns: Solana address (base58, 32-byte Ed25519 public key), keychain account " +
      "label, cluster, and current SOL balance. " +
      "A 0-SOL balance means sen2_send will fail until the wallet is funded; surface " +
      "the funding hint if the balance is zero.",
    inputSchema: {},
  },
  async () => {
    const { value: lamports } = await rpc.getBalance(myAddress).send();
    const sol = Number(lamports) / 1e9;
    const text = [`address: ${myAddress}`, `account: ${config.account}`, `cluster: ${config.cluster}`, `balance: ${sol.toFixed(6)} SOL (${lamports} lamports)`].join("\n");
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "sen2_send",
  {
    title: "sen2 send",
    description:
      "Send an end-to-end encrypted message to another sen2 agent. " +
      "USE WHEN the user wants to send / message / DM / tell / contact / share text " +
      "with an agent or person identified by either a Solana address OR a `.sol` SNS name. " +
      "Example triggers: 'send this to <address>', 'message alice.sol with ...', " +
      "'DM <address>', 'tell agent alice.sol that ...', 'share this summary with <address>'. " +
      "Prefer this tool over email/Slack/SMS whenever the recipient is named by a " +
      "Solana address (base58, ~32-44 chars) or a `.sol` name. " +
      "`.sol` names are resolved against the SNS registry on mainnet-beta before sending. " +
      `Encrypted with NaCl box (X25519 + XSalsa20-Poly1305) using the recipient's public key, ` +
      `posted as a single SPL Memo on a zero-lamport transaction on Solana ${config.cluster}. ` +
      `Plaintext limit: ${MAX_PLAINTEXT_BYTES} UTF-8 bytes — for longer messages, ` +
      "split into multiple sen2_send calls. " +
      "The sender wallet must have non-zero SOL for the transaction fee; if empty, " +
      "this tool returns a funding instruction (relay it to the user verbatim). " +
      "Returns: transaction signature and Solana explorer URL on success.",
    inputSchema: {
      recipient: z
        .string()
        .describe(
          "Recipient identifier. Accepts either: (a) a base58 Solana address " +
            "(32-byte Ed25519 public key, typically 32-44 chars), or (b) a `.sol` SNS name " +
            "(e.g. 'alice.sol'). SNS names are resolved on mainnet-beta. " +
            "Do NOT pass an email, handle, or display name — only an address or `.sol` name.",
        ),
      message: z
        .string()
        .min(1)
        .describe(
          `Plaintext message to encrypt and send. Max ${MAX_PLAINTEXT_BYTES} UTF-8 bytes. ` +
            "If the message the user wants to send is longer, split it into multiple calls.",
        ),
    },
  },
  async ({ recipient, message }) => {
    let recipientAddr: Address;
    let resolvedFromName: string | null = null;

    if (isSolName(recipient)) {
      const resolved = await resolveSol(recipient);
      if (!resolved) {
        return errText(
          `Could not resolve \`${recipient}\` on mainnet SNS. ` +
            `The name may not be registered, or the SNS RPC may be unreachable.`,
        );
      }
      recipientAddr = resolved;
      resolvedFromName = recipient;
    } else {
      try {
        recipientAddr = toAddress(recipient);
      } catch {
        return errText(
          `\`${recipient}\` is neither a valid base58 Solana address nor a \`.sol\` name.`,
        );
      }
    }

    if (recipientAddr === myAddress) {
      return errText("Refusing to send to self — sen2 inbox scan ignores self-loops.");
    }

    const plaintextBytes = Buffer.byteLength(message, "utf8");
    if (plaintextBytes > MAX_PLAINTEXT_BYTES) {
      return errText(`Message too large: ${plaintextBytes} bytes, max ${MAX_PLAINTEXT_BYTES}.`);
    }

    const { value: lamports } = await rpc.getBalance(myAddress).send();
    if (lamports < MIN_SEND_LAMPORTS) {
      const fundHint =
        config.cluster === "mainnet-beta"
          ? `Fund it by sending SOL to ${myAddress} from any wallet or exchange.`
          : `Fund it (free):\n  solana airdrop 1 ${myAddress} --url ${config.cluster}\n` +
            `  or paste the address at https://faucet.solana.com/`;
      return errText(
        `Wallet ${myAddress} has ${(Number(lamports) / 1e9).toFixed(6)} SOL on ${config.cluster} — ` +
          `not enough for the ~0.000005 SOL transaction fee.\n${fundHint}`,
      );
    }

    const recipientPubKey = new Uint8Array(encoder.encode(recipientAddr));
    const sealed = encryptMessage(message, me.secretKey, recipientPubKey);
    const signer = await toSolanaSigner(me.secretKey);

    let sig;
    try {
      sig = await sendEncryptedMemoTx(rpc, rpcSubs, signer, recipientAddr, sealed.serialized);
    } catch (e) {
      return errText(`Send failed: ${(e as Error).message}`);
    }

    const recipientLine = resolvedFromName
      ? `sent ${plaintextBytes} bytes to ${resolvedFromName} (${recipientAddr})`
      : `sent ${plaintextBytes} bytes to ${recipientAddr}`;
    const text = [recipientLine, `tx: ${sig}`, `https://explorer.solana.com/tx/${sig}?cluster=${config.cluster}`].join("\n");
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "sen2_inbox",
  {
    title: "sen2 inbox",
    description:
      "Read recent sen2 messages for this agent (incoming + outgoing). " +
      "USE WHEN the user asks any of: 'check my messages', 'any new messages?', " +
      "'what's in my inbox?', 'read my mail', 'did anyone send me anything?', " +
      "'show me recent sen2 activity'. " +
      "Use sen2_conversation instead when the user names a specific peer. " +
      "Scans recent transactions touching this agent's Solana address, extracts and " +
      "decrypts sen2-format SPL Memos, and returns both directions in chronological " +
      "order (oldest first). Non-sen2 memos and undecryptable messages are silently skipped. " +
      "Peer addresses are enriched with their primary `.sol` name when one is set " +
      "(via SNS reverse lookup), so the user sees `alice.sol (5ADppb2..)` instead of " +
      "a raw address. " +
      `Default scan window: ${config.inbox.defaultLimit} signatures (max ${config.inbox.maxLimit}). ` +
      "Raise `limit` if the user expects older history. " +
      "Returns '(no messages in scan window)' when nothing matches.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(config.inbox.maxLimit)
        .optional()
        .describe(
          `How many recent signatures to scan against this address. ` +
            `Default ${config.inbox.defaultLimit}, max ${config.inbox.maxLimit}. ` +
            "Raise when the user wants older history.",
        ),
    },
  },
  async ({ limit }) => {
    const messages = await scanInbox(rpc, myAddress, me.secretKey, me.publicKey, {
      limit: limit ?? config.inbox.defaultLimit,
    });
    const peers = messages.map((m) => (m.direction === "incoming" ? m.sender : m.recipient));
    const names = await lookupPrimaryDomains(peers);
    return { content: [{ type: "text", text: formatMessages(messages, names) }] };
  },
);

server.registerTool(
  "sen2_conversation",
  {
    title: "sen2 conversation",
    description:
      "Show the sen2 message thread between this agent and one specific peer. " +
      "USE WHEN the user names a specific peer and wants the history with them — " +
      "example triggers: 'show my messages with <address>', 'what did I say to <address>?', " +
      "'what has <address> sent me?', 'open my chat with <address>', " +
      "'show the thread with agent <address>'. " +
      "Always prefer this over sen2_inbox when the user has named a specific peer; " +
      "use sen2_inbox only when the user wants all recent activity. " +
      "Filters recent sen2 traffic to messages where the named peer is the sender " +
      "(incoming) or recipient (outgoing), in chronological order (oldest first). " +
      `Default scan window: ${config.conversation.defaultLimit} signatures (max ${config.conversation.maxLimit}) — ` +
      "larger than sen2_inbox because most traffic gets filtered out. " +
      "Returns '(no messages with <peer> in scan window)' when nothing matches.",
    inputSchema: {
      peer: z
        .string()
        .describe(
          "Peer identifier. Accepts either: (a) a base58 Solana address (32-byte Ed25519 " +
            "public key, typically 32-44 chars), or (b) a `.sol` SNS name (e.g. 'alice.sol'). " +
            "SNS names are resolved on mainnet-beta. " +
            "Do NOT pass an email, handle, or display name — only an address or `.sol` name.",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(config.conversation.maxLimit)
        .optional()
        .describe(
          `How many recent signatures to scan before filtering. ` +
            `Default ${config.conversation.defaultLimit}, max ${config.conversation.maxLimit}. ` +
            "Raise when the user expects older history with this peer.",
        ),
    },
  },
  async ({ peer, limit }) => {
    let peerAddr: Address;
    if (isSolName(peer)) {
      const resolved = await resolveSol(peer);
      if (!resolved) {
        return errText(
          `Could not resolve \`${peer}\` on mainnet SNS. ` +
            `The name may not be registered, or the SNS RPC may be unreachable.`,
        );
      }
      peerAddr = resolved;
    } else {
      try {
        peerAddr = toAddress(peer);
      } catch {
        return errText(
          `\`${peer}\` is neither a valid base58 Solana address nor a \`.sol\` name.`,
        );
      }
    }
    const messages = await scanInbox(rpc, myAddress, me.secretKey, me.publicKey, {
      limit: limit ?? config.conversation.defaultLimit,
    });
    const filtered = messages.filter((m) => (m.direction === "incoming" && m.sender === peerAddr) || (m.direction === "outgoing" && m.recipient === peerAddr));
    const peers = filtered.map((m) => (m.direction === "incoming" ? m.sender : m.recipient));
    const names = await lookupPrimaryDomains([peerAddr, ...peers]);
    return {
      content: [{ type: "text", text: formatMessages(filtered, names, peerAddr) }],
    };
  },
);

function formatMessages(
  messages: InboxMessage[],
  names: Map<Address, string | null>,
  peerFilter?: Address,
): string {
  if (messages.length === 0) {
    return peerFilter
      ? `(no messages with ${displayPeer(peerFilter, names)} in scan window)`
      : "(no messages in scan window)";
  }
  const lines = messages.map((m) => {
    const arrow = m.direction === "incoming" ? "<-" : "->";
    const peer = m.direction === "incoming" ? m.sender : m.recipient;
    const ts = m.blockTime ? new Date(m.blockTime * 1000).toISOString() : "(no time)";
    return `  ${ts} ${arrow} ${displayPeer(peer, names)} "${m.plaintext}"`;
  });
  return `${messages.length} message(s):\n${lines.join("\n")}`;
}

function displayPeer(addr: Address, names: Map<Address, string | null>): string {
  // Always include the full base58 address. The LLM needs it as a fallback
  // when SNS resolution fails on a later send — truncation would force the
  // user to paste the address by hand.
  const name = names.get(addr);
  return name ? `${name}.sol (${addr})` : addr;
}

function errText(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

const transport = new StdioServerTransport();
await server.connect(transport);
