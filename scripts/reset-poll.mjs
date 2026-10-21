/**
 * Zeroes the deployed poll counts — every poll by default, or one with POLL_ID.
 *
 * Deliberately an operator script rather than an HTTP endpoint: the facilitator sign-in
 * gate is a convenience, not a security boundary (see deploy/aws-s3-cloudfront.md), so a
 * reachable reset route would let any participant wipe the room's answers mid-session.
 *
 *   aws sso login --profile ashg2026
 *   AWS_PROFILE=ashg2026 POLLING_TABLE_NAME=<table> node scripts/reset-poll.mjs
 *   AWS_PROFILE=ashg2026 POLLING_TABLE_NAME=<table> POLL_ID=analytic-practice node scripts/reset-poll.mjs
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { polls } from "../backend/polling/poll.mjs";

const tableName = process.env.POLLING_TABLE_NAME;
if (!tableName) {
  console.error("Set POLLING_TABLE_NAME to the deployed DynamoDB table.");
  process.exit(1);
}

const only = process.env.POLL_ID;
if (only && !polls.has(only)) {
  console.error(`Unknown POLL_ID ${only}. Known polls: ${[...polls.keys()].join(", ")}.`);
  process.exit(1);
}
const targets = only ? [polls.get(only)] : [...polls.values()];

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Deleting the items is the reset: DynamoPollStore.snapshot() reports a missing item as
// zero, so the poll reads empty again without leaving stale counters behind.
const keys = targets.flatMap((poll) => poll.options.map((option) => ({ pollId: poll.id, optionId: option.id })));
await Promise.all(keys.map((Key) => client.send(new DeleteCommand({ TableName: tableName, Key }))));

console.log(`Reset ${keys.length} option counts across ${targets.length} poll(s) in ${tableName}.`);
