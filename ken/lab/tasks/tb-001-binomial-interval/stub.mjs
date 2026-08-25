/* tb-001 · the do-nothing stub. NOT a mutant and not a solution: it is
   the floor arm. A check an empty implementation passes is a check that
   measures nothing, and the bank refuses a task whose checks it clears. */
export function interval(x, n, alpha = 0.05) {
  return { lower: 0, upper: 1, point: x / n, x, n, alpha };
}
