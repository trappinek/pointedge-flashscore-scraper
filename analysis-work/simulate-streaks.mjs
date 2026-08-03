const n = 506;
const p = 285 / 506;
const trials = 100000;
const maxWins = [];
const maxLosses = [];
const transitions = [];

for (let trial = 0; trial < trials; trial += 1) {
  let previous = Math.random() < p;
  let currentLength = 1;
  let maxWin = previous ? 1 : 0;
  let maxLoss = previous ? 0 : 1;
  let changeCount = 0;
  for (let i = 1; i < n; i += 1) {
    const current = Math.random() < p;
    if (current === previous) {
      currentLength += 1;
    } else {
      changeCount += 1;
      currentLength = 1;
      previous = current;
    }
    if (current) maxWin = Math.max(maxWin, currentLength);
    else maxLoss = Math.max(maxLoss, currentLength);
  }
  maxWins.push(maxWin);
  maxLosses.push(maxLoss);
  transitions.push(changeCount);
}

function quantiles(values) {
  values.sort((a, b) => a - b);
  const at = (q) => values[Math.floor(q * (values.length - 1))];
  return {
    p05: at(0.05),
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
  };
}

console.log(JSON.stringify({
  n,
  p,
  maxWin: quantiles(maxWins),
  maxLoss: quantiles(maxLosses),
  transitions: quantiles(transitions),
  probabilityMaxWinAtLeast39: maxWins.filter((v) => v >= 39).length / trials,
  probabilityMaxLossAtLeast11: maxLosses.filter((v) => v >= 11).length / trials,
  probabilityTransitionsAtMost169: transitions.filter((v) => v <= 169).length / trials,
}, null, 2));
