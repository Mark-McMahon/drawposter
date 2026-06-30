// Per-connection token-bucket rate limiter.
//
// Time is injected (`now`) so the bucket is deterministically unit-testable.
// `take()` consumes one token; it returns false when the caller is over budget,
// at which point the transport layer drops the message (and, after sustained
// abuse, hangs up the socket).

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.tokens = capacity;
    this.last = this.now();
  }

  /** Consume one token. Returns true if allowed, false if rate-limited. */
  take(): boolean {
    const t = this.now();
    const elapsed = (t - this.last) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
      this.last = t;
    }
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}
