import io
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from flask import Flask, render_template, request, jsonify
from backend.analyzer import StatisticalTrapAnalyzer

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB max upload

analyzer = StatisticalTrapAnalyzer()
ANALYSIS_HISTORY = []
TOTAL_DATASETS_COUNTER = 148


def build_demo_dataset(range_days: int = 30, severity_filter: str = "all") -> pd.DataFrame:
    rng = np.random.default_rng(42 + range_days)
    n = max(31, range_days * 12)
    base_date = datetime(2026, 10, 13)
    dates = [(base_date + timedelta(days=int(i * 31 / n))).strftime("%Y-%m-%d") for i in range(n)]

    segments = rng.choice(["Enterprise", "Mid-Market", "SMB"], size=n, p=[0.28, 0.42, 0.30])
    ad_spend = np.zeros(n)
    conversion_revenue = np.zeros(n)

    for i, seg in enumerate(segments):
        if seg == "Enterprise":
            ad_spend[i] = rng.normal(82, 8)
            conversion_revenue[i] = 310 - 0.85 * ad_spend[i] + rng.normal(0, 6)
        elif seg == "Mid-Market":
            ad_spend[i] = rng.normal(52, 7)
            conversion_revenue[i] = 240 - 0.70 * ad_spend[i] + rng.normal(0, 6)
        else:
            ad_spend[i] = rng.normal(24, 5)
            conversion_revenue[i] = 165 - 0.60 * ad_spend[i] + rng.normal(0, 5)

    spike_start = int(n * 0.82)
    spike_end = min(n, spike_start + max(3, n // 15))
    conversion_revenue[spike_start:spike_end] *= 1.48

    lead_source = rng.choice(["Organic Search", "Direct", "Paid Social", None], size=n, p=[0.42, 0.25, 0.14, 0.19])
    risk_flag = np.where(conversion_revenue > 265, "Anomalous", "Normal")

    df = pd.DataFrame({
        "Date": dates,
        "Revenue_Index": np.round(conversion_revenue, 2),
        "Acquisition_Cost": np.round(ad_spend, 2),
        "Pipeline_Score": np.round(conversion_revenue * 0.94 + rng.normal(0, 2.5, size=n), 2),
        "Customer_Segment": segments,
        "Lead_Source": lead_source,
        "Audit_Status": risk_flag,
    })

    if severity_filter == "high":
        df = df[df["Revenue_Index"] > df["Revenue_Index"].quantile(0.25)].reset_index(drop=True)
    return df


def get_initial_analysis():
    global TOTAL_DATASETS_COUNTER
    demo_df = build_demo_dataset(30, "all")
    result = analyzer.analyze_dataframe(demo_df, dataset_name="Enterprise_Telemetry_Q4 (Demo)", is_demo=True)
    result["kpis"]["datasets_analyzed"]["value"] = TOTAL_DATASETS_COUNTER
    ANALYSIS_HISTORY.append({
        "id": "DS-1048",
        "name": result["dataset_name"],
        "rows": result["rows"],
        "cols": result["columns"],
        "traps": result["kpis"]["traps_detected"]["value"],
        "quality": result["kpis"]["data_quality_score"]["value"],
        "is_demo": True,
        "timestamp": result["timestamp"],
    })
    return result


CURRENT_ANALYSIS = get_initial_analysis()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/dashboard", methods=["GET"])
def api_dashboard():
    global CURRENT_ANALYSIS, TOTAL_DATASETS_COUNTER
    range_param = request.args.get("range", "30d")
    severity_param = request.args.get("severity", "all")

    if CURRENT_ANALYSIS.get("is_demo", True):
        days = 7 if range_param == "7d" else (90 if range_param == "90d" else 30)
        demo_df = build_demo_dataset(days, severity_param)
        result = analyzer.analyze_dataframe(
            demo_df,
            dataset_name=f"Enterprise_Telemetry_{range_param.upper()} (Demo)",
            is_demo=True,
        )
        result["kpis"]["datasets_analyzed"]["value"] = TOTAL_DATASETS_COUNTER
        if severity_param != "all":
            filtered = [
                a for a in result["recent_anomalies"]
                if a["severity"].lower() == severity_param.lower()
            ]
            if filtered:
                result["recent_anomalies"] = filtered
        CURRENT_ANALYSIS = result

    return jsonify({"status": "ok", "data": CURRENT_ANALYSIS, "history": ANALYSIS_HISTORY})


@app.route("/api/upload", methods=["POST"])
def api_upload():
    global CURRENT_ANALYSIS, TOTAL_DATASETS_COUNTER
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No dataset file provided."}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"status": "error", "message": "Empty filename."}), 400

    filename = file.filename
    try:
        raw_bytes = file.read()
        if filename.lower().endswith(".json"):
            df = pd.read_json(io.BytesIO(raw_bytes))
        else:
            df = pd.read_csv(io.BytesIO(raw_bytes))

        result = analyzer.analyze_dataframe(df, dataset_name=filename, is_demo=False)
        TOTAL_DATASETS_COUNTER += 1
        result["kpis"]["datasets_analyzed"]["value"] = TOTAL_DATASETS_COUNTER
        CURRENT_ANALYSIS = result

        ANALYSIS_HISTORY.insert(0, {
            "id": f"DS-{1000 + TOTAL_DATASETS_COUNTER}",
            "name": filename,
            "rows": result["rows"],
            "cols": result["columns"],
            "traps": result["kpis"]["traps_detected"]["value"],
            "quality": result["kpis"]["data_quality_score"]["value"],
            "is_demo": False,
            "timestamp": result["timestamp"],
        })

        return jsonify({"status": "ok", "data": result, "history": ANALYSIS_HISTORY})
    except Exception as exc:
        return jsonify({"status": "error", "message": f"Analysis failed: {str(exc)}"}), 400


@app.route("/api/reset-demo", methods=["POST"])
def api_reset_demo():
    global CURRENT_ANALYSIS, TOTAL_DATASETS_COUNTER
    demo_df = build_demo_dataset(30, "all")
    result = analyzer.analyze_dataframe(demo_df, dataset_name="Enterprise_Telemetry_Q4 (Demo)", is_demo=True)
    result["kpis"]["datasets_analyzed"]["value"] = TOTAL_DATASETS_COUNTER
    CURRENT_ANALYSIS = result
    return jsonify({"status": "ok", "data": result, "history": ANALYSIS_HISTORY})


@app.route("/api/ask-ai", methods=["POST"])
def api_ask_ai():
    payload = request.get_json(silent=True) or {}
    question = (payload.get("question") or "").strip()
    if not question:
        return jsonify({"status": "error", "message": "Please enter a question."}), 400

    data = CURRENT_ANALYSIS
    q_low = question.lower()
    top_trap = data["ai_insight"]
    kpis = data["kpis"]

    if "simpson" in q_low or "trap" in q_low or "bias" in q_low:
        traps_summary = "; ".join([f"{t['category']} ({t['severity']}, {t['confidence']}% conf)" for t in data["all_traps"]])
        answer = (
            f"In '{data['dataset_name']}', SPYNEX AI detected {kpis['traps_detected']['value']} statistical traps: "
            f"{traps_summary}. Primary finding: {top_trap['title']} — {top_trap['explanation']}"
        )
    elif "anomal" in q_low or "spike" in q_low or "outlier" in q_low:
        mc = data["main_chart"]
        answer = (
            f"Isolation Forest identified {kpis['anomalies_detected']['value']} anomalous records across {data['rows']} rows. "
            f"Peak deviation occurred on {mc['highlight_date']}: {mc['highlight_summary']}"
        )
    elif "quality" in q_low or "clean" in q_low or "missing" in q_low:
        answer = (
            f"Current Data Quality Score is {kpis['data_quality_score']['value']} across {data['rows']} rows and "
            f"{data['columns']} features, with {data['dataset_breakdown']['segments'][0]['pct']}% verified clean records."
        )
    else:
        answer = (
            f"Active Dataset: {data['dataset_name']} ({data['rows']} rows, {data['columns']} cols). "
            f"Data Quality is {kpis['data_quality_score']['value']}, Analysis Accuracy is {kpis['analysis_accuracy']['value']}, "
            f"with {kpis['traps_detected']['value']} statistical traps and {kpis['anomalies_detected']['value']} anomalies flagged. "
            f"Highest priority alert: {top_trap['title']} ({top_trap['confidence']}% confidence)."
        )

    return jsonify({"status": "ok", "answer": answer, "dataset": data["dataset_name"]})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
