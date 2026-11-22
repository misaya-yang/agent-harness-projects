// Sweep the same parameter as the slider so a reader can see both the current
// measurement and how it fits into the full response curve.
export function parameterStudy({ title, question, control, axis, labels, measure, explanation, check, answer, digits = 3 }) {
  const number = new Intl.NumberFormat("en-US", {
    useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits, roundingMode: "halfEven",
  });
  const steps = Math.round((control.max - control.min) / control.step);
  const samples = Array.from({ length: steps + 1 }, (_, i) => {
    const x = Number((control.min + i * control.step).toFixed(8));
    return { x, values: measure(x) };
  });
  const series = labels.map((label, column) => ({
    label, points: samples.map(({ x, values }) => [x, values[column]]),
  }));
  return {
    title, question, controls: [control], scrub: { key: control.key },
    check: { question: check, answer },
    evaluate(state) {
      const x = state[control.key];
      const values = measure(x);
      return {
        type: "lines", series, xLabel: control.label, yLabel: axis,
        point: { x, y: values[0], label: labels[0] + "的当前值" },
        readout: labels.map((label, i) => label + " " + number.format(values[i])).join(" · "),
        explanation,
      };
    },
  };
}
