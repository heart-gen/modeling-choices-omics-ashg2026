import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { buildSnapshot, isKnownOption, requirePoll } from "./poll.mjs";

/**
 * One item per (pollId, optionId), so every poll shares the one table and the partition
 * key keeps them apart.
 *
 * A vote is a single `ADD #count :one` UpdateItem, which DynamoDB applies atomically on
 * the server. That matters more than it looks: 150 people answering the opening question
 * inside the same ten seconds is precisely the burst that a read-modify-write store
 * undercounts, and an undercounted poll is one the facilitator narrates wrongly in front
 * of the room. Reading is a single Query on the partition key.
 */
export class DynamoPollStore {
  #client;
  #tableName;

  constructor({ tableName = process.env.POLLING_TABLE_NAME, client } = {}) {
    if (!tableName) {
      throw new Error("POLLING_TABLE_NAME must be set for the DynamoDB poll store");
    }
    this.#tableName = tableName;
    this.#client = DynamoDBDocumentClient.from(client ?? new DynamoDBClient({}));
  }

  async respond(pollId, optionId) {
    const poll = requirePoll(pollId);
    if (!isKnownOption(poll, optionId)) {
      throw new Error("Unknown poll option");
    }
    await this.#client.send(new UpdateCommand({
      TableName: this.#tableName,
      Key: { pollId: poll.id, optionId },
      UpdateExpression: "ADD #count :one",
      ExpressionAttributeNames: { "#count": "count" },
      ExpressionAttributeValues: { ":one": 1 }
    }));
    return this.snapshot(poll.id);
  }

  async snapshot(pollId) {
    const poll = requirePoll(pollId);
    const result = await this.#client.send(new QueryCommand({
      TableName: this.#tableName,
      KeyConditionExpression: "pollId = :pollId",
      ExpressionAttributeValues: { ":pollId": poll.id },
      // Counts are the whole payload and the table is tiny; a strongly consistent read
      // keeps the number the voter sees consistent with the vote they just cast.
      ConsistentRead: true
    }));
    const counts = new Map((result.Items ?? []).map((item) => [item.optionId, Number(item.count ?? 0)]));
    return buildSnapshot(poll, counts);
  }
}
