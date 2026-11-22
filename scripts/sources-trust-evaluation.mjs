const direct = (label, url) => ({ label, url, kind: "direct" });
const arxiv = (label, id) => direct(label, `https://arxiv.org/abs/${id}`);

export default {
  "9.1": [
    direct("Elhage et al. · Toy Models of Superposition", "https://transformer-circuits.pub/2022/toy_model/index.html"),
    direct("Bricken et al. · Towards Monosemanticity", "https://transformer-circuits.pub/2023/monosemantic-features/index.html"),
    direct("Templeton et al. · Scaling Monosemanticity", "https://transformer-circuits.pub/2024/scaling-monosemanticity/index.html"),
    direct("Anthropic · Circuit Tracing: Methods", "https://transformer-circuits.pub/2025/attribution-graphs/methods.html"),
    arxiv("Hewitt & Liang · Designing and Interpreting Probes with Control Tasks", "1909.03368"),
    arxiv("Meng et al. · Locating and Editing Factual Associations in GPT", "2202.05262"),
    arxiv("Turner et al. · Steering Language Models With Activation Engineering", "2308.10248"),
  ],
  "9.2": [
    arxiv("Bai et al. · Constitutional AI: Harmlessness from AI Feedback", "2212.08073"),
    arxiv("Guan et al. · Deliberative Alignment: Reasoning Enables Safer Language Models", "2412.16339"),
    arxiv("Röttger et al. · XSTest: A Test Suite for Identifying Exaggerated Safety Behaviours in Large Language Models", "2308.01263"),
    direct("OpenAI · Model Spec", "https://model-spec.openai.com/"),
    direct("NIST · AI Risk Management Framework 1.0", "https://doi.org/10.6028/NIST.AI.100-1"),
  ],
  "9.3": [
    arxiv("Guo et al. · On Calibration of Modern Neural Networks", "1706.04599"),
    arxiv("Geifman & El-Yaniv · Selective Classification for Deep Neural Networks", "1705.08500"),
    direct("Farquhar et al. · Detecting hallucinations in large language models using semantic entropy", "https://www.nature.com/articles/s41586-024-07421-0"),
    arxiv("Kadavath et al. · Language Models (Mostly) Know What They Know", "2207.05221"),
    direct("OpenAI · Why language models hallucinate", "https://openai.com/index/why-language-models-hallucinate/"),
  ],
};
