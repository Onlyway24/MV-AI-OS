import { isRetryablePollingFailure, telegramOperatorError, TelegramOperatorError } from "./telegram-operator-errors.js";

export interface TelegramPollingConsole {
  readonly isStopped?: boolean;
  bootstrap(): Promise<void>;
  close(): Promise<void>;
  pollOnce(): Promise<void>;
}

export interface TelegramOperatorLifecycleOptions {
  readonly delay?: (milliseconds: number) => Promise<void>;
  readonly maxPollingRetries?: number;
  readonly stopping?: () => boolean;
}

const DEFAULT_RETRY_DELAYS_MS = Object.freeze([100, 250, 500] as const);

/** Owns one operator console from bootstrap through one awaited, idempotent close. */
export class TelegramOperatorLifecycle {
  #closePromise: Promise<void> | undefined;
  #stopRequested = false;
  readonly #delay: (milliseconds: number) => Promise<void>;
  readonly #maxPollingRetries: number;
  readonly #stopping: () => boolean;

  public constructor(private readonly console: TelegramPollingConsole, options: TelegramOperatorLifecycleOptions = {}) {
    this.#delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#maxPollingRetries = options.maxPollingRetries ?? DEFAULT_RETRY_DELAYS_MS.length;
    this.#stopping = options.stopping ?? (() => false);
  }

  public requestStop(): void { this.#stopRequested = true; }

  public async run(): Promise<void> {
    let failure: TelegramOperatorError | undefined;
    try {
      await this.console.bootstrap();
      let retries = 0;
      while (!this.#shouldStop()) {
        try {
          await this.console.pollOnce();
          retries = 0;
        } catch (error) {
          if (isRetryablePollingFailure(error) && retries < this.#maxPollingRetries && !this.#shouldStop()) {
            const delay = DEFAULT_RETRY_DELAYS_MS[Math.min(retries, DEFAULT_RETRY_DELAYS_MS.length - 1)] ?? 500;
            retries += 1;
            await this.#delay(delay);
            continue;
          }
          failure = telegramOperatorError(error, "INTERNAL_OPERATOR_FAILURE", "POLLING");
          break;
        }
      }
    } catch (error) {
      failure = telegramOperatorError(error, "INTERNAL_OPERATOR_FAILURE", "BOOTSTRAP");
    }
    try {
      await this.close();
    } catch (error) {
      failure = telegramOperatorError(error, "OPERATOR_SHUTDOWN_FAILED", "SHUTDOWN");
    }
    if (failure !== undefined) throw failure;
  }

  public close(): Promise<void> {
    if (this.#closePromise === undefined) {
      this.#closePromise = this.console.close().catch(() => {
        throw new TelegramOperatorError("OPERATOR_SHUTDOWN_FAILED", "SHUTDOWN", false);
      });
    }
    return this.#closePromise;
  }

  #shouldStop(): boolean { return this.#stopRequested || this.#stopping() || this.console.isStopped === true; }
}
