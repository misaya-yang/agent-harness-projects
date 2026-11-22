const direct = (label, url) => ({ label, url, kind: "direct" });
const paper = (label, id) => direct(label, `https://arxiv.org/abs/${id}`);

export default {
  "8.1": [
    paper("Representation Learning with Contrastive Predictive Coding（InfoNCE）", "1807.03748"),
    paper("Dense Passage Retrieval for Open-Domain Question Answering（DPR）", "2004.04906"),
    paper("SimCSE: Simple Contrastive Learning of Sentence Embeddings", "2104.08821"),
    paper("Efficient and Robust Approximate Nearest Neighbor Search Using Hierarchical Navigable Small World Graphs（HNSW）", "1603.09320"),
    direct("hnswlib · 参数 M、ef 与 ef_construction", "https://github.com/nmslib/hnswlib/blob/master/ALGO_PARAMS.md"),
    direct("Faiss · 索引与内存开销", "https://github.com/facebookresearch/faiss/wiki/Faiss-indexes"),
    direct("Product Quantization for Nearest Neighbor Search（原始论文）", "https://inria.hal.science/inria-00514462"),
    paper("Matryoshka Representation Learning", "2205.13147"),
    direct("OpenAI · New embedding models and API updates（dimensions 参数）", "https://openai.com/index/new-embedding-models-and-api-updates/"),
  ],
  "8.2": [
    paper("Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", "2005.11401"),
    direct("The Probabilistic Relevance Framework: BM25 and Beyond（作者提供的原文）", "https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf"),
    paper("Dense Passage Retrieval for Open-Domain Question Answering", "2004.04906"),
    direct("Reciprocal Rank Fusion Outperforms Condorcet and Individual Rank Learning Methods", "https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf"),
    direct("Sentence Transformers · Retrieve & Re-Rank", "https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html"),
    paper("Lost in the Middle: How Language Models Use Long Contexts", "2307.03172"),
    paper("RAGAS: Automated Evaluation of Retrieval Augmented Generation", "2309.15217"),
    direct("Ragas · Available Metrics", "https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/"),
  ],
};
