import pandas as pd
import time
import os
from supabase import create_client, Client
from statsmodels.tsa.api import VAR
import warnings
import traceback

warnings.filterwarnings("ignore")

# --- CONFIGURATION ---
URL = "https://elhshkzfiqmyisxavnsh.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k"
supabase: Client = create_client(URL, KEY)

def fetch_and_predict():
    # 1. Pull latest data
    response = supabase.table("sensors").select("*").order("recorded_id", desc=True).limit(100).execute()
    df = pd.DataFrame(response.data).iloc[::-1]
    
    df['recorded_id'] = pd.to_datetime(df['recorded_id'])
    df.set_index('recorded_id', inplace=True)
    df = df[['temperature', 'humidity', 'uv_index']].resample('15s').mean().interpolate()

    # 2. Run the VAR Model (10-minute forecast)
    model = VAR(df)
    results = model.fit(maxlags=5)
    forecast = results.forecast(df.values[-results.k_ar:], steps=40)
    
    return df.iloc[-1], forecast[-1]

def get_trend_narrative(current, predicted, unit):
    diff = predicted - current
    if diff > 0.05: return f"RISING (by {abs(diff):.2f}{unit})"
    if diff < -0.05: return f"FALLING (by {abs(diff):.2f}{unit})"
    return "STABLE"

# --- THE LIVE MONITORING & UPLOAD LOOP ---
print("Initializing MediSafe AI Live Monitor & Uploader...")

try:
    while True:
        os.system('cls' if os.name == 'nt' else 'clear')
        
        current, predicted = fetch_and_predict()
        
        # --- FIX: Using .iloc to safely access the Pandas Series ---
        curr_temp = current.iloc[0]
        curr_hum = current.iloc[1]
        curr_uv = current.iloc[2]

        # Calculate trends
        t_trend = get_trend_narrative(curr_temp, predicted[0], "°C")
        h_trend = get_trend_narrative(curr_hum, predicted[1], "%")
        u_trend = get_trend_narrative(curr_uv, predicted[2], "")

        # --- NEW: PUSH TO SUPABASE ---
        prediction_data = {
            "predicted_temp": round(predicted[0], 2),
            "predicted_hum": round(predicted[1], 2),
            "predicted_uv": round(predicted[2], 2),
            "temp_trend": t_trend,
            "hum_trend": h_trend,
            "uv_trend": u_trend
        }
        
        # Insert the data into the new table
        supabase.table("ai_predictions").insert(prediction_data).execute()
        
        # --- TERMINAL DISPLAY ---
        print(f" MEDISAFE LIVE AI DASHBOARD | {time.strftime('%H:%M:%S')}")
        print(f"TEMPERATURE: {curr_temp:>5.2f}°C -> Forecast: {predicted[0]:>5.2f}°C | {t_trend}")
        print(f"HUMIDITY   : {curr_hum:>5.2f}%  -> Forecast: {predicted[1]:>5.2f}%  | {h_trend}")
        print(f"UV INDEX   : {curr_uv:>5.2f}   -> Forecast: {predicted[2]:>5.2f}   | {u_trend}")
        print("✅ Prediction successfully uploaded to Supabase!")
        print("Waiting 15 seconds for next cycle...")
        
        time.sleep(15)

except KeyboardInterrupt:
    print("\nMonitoring stopped by user.")
except Exception as e:
    print("\n❌ Detailed Error:")
    traceback.print_exc()