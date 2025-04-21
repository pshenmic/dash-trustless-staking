import readline from "readline";
import logger from "../logger.js";
import PoolRepository from "../repositories/PoolRepository.js";

/**
 * @param {Client} sdk
 * @returns {function(string, string?): Promise<void>}
 */
const listPoolAction = (sdk) => {
  return async (limit, startAt) => {
    const poolRepository = new PoolRepository(sdk);

    // Validate limit
    const pageSize = parseInt(limit, 10);
    if (Number.isNaN(pageSize) || pageSize <= 0) {
      logger.error("Invalid limit. It must be a positive number.");
      process.exit(1);
    }

    let currentStartAt = startAt || null;

    // Create readline interface for user input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Helper to prompt user
    const question = (query) =>
      new Promise((resolve) => rl.question(query, resolve));

    try {
      while (true) {
        const { pools, nextStartAt } = await poolRepository.list(
          currentStartAt,
          pageSize
        );

        if (pools.length === 0) {
          logger.log("No pools found.");
          break;
        }

        // Display pools
        pools.forEach((pool, idx) => {
          logger.log(
            `${idx + 1}. ID: ${pool.id}, Name: ${pool.name}, Type: ${pool.type}, Status: ${pool.status}, CreatedAt: ${new Date(
              pool.createdAt
            ).toISOString()}`
          );
        });

        if (!nextStartAt) {
          logger.log("End of pool list.");
          break;
        }

        const answer = await question(
          'Press <Enter> to load next page or "q" to quit: '
        );
        if (answer.trim().toLowerCase() === "q") {
          break;
        }

        currentStartAt = nextStartAt;
      }
    } catch (error) {
      logger.error("Error listing pools:", error);
      process.exit(1);
    } finally {
      rl.close();
    }
  };
};

export default listPoolAction;
