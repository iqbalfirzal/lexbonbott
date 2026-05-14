import sys
import json
import os
from openai import OpenAI

def main():
    try:
        # Read payload from stdin
        input_data = sys.stdin.read()
        if not input_data:
            raise ValueError("No input data received from stdin")
            
        payload = json.loads(input_data)
        
        # Extract components
        market_data = payload.get('market_data', {})
        memory_state = payload.get('memory_state', {})
        
        symbol = market_data.get('symbol', 'Unknown')
        
        # Extract pinned lessons
        pinned_lessons = memory_state.get('pinned_lessons', [])
        lessons_text = "\n".join(f"- {lesson}" for lesson in pinned_lessons)
        
        # Initialize DeepSeek via OpenAI client
        api_key = os.environ.get('DEEPSEEK_API_KEY')
        if not api_key:
            raise ValueError("DEEPSEEK_API_KEY environment variable is missing.")
            
        client = OpenAI(
            api_key=api_key,
            base_url="https://api.deepseek.com"
        )
        
        # Construct system prompt
        system_prompt = f"""You are an institutional quant AI. Analyze the provided OHLCV and Order Book.
You MUST output ONLY valid JSON in this exact structure:
{{
  "status": "success",
  "morning_briefing": "Short market summary",
  "action": {{
    "type": "BUY|SELL|STANDBY",
    "market": "{symbol}",
    "reason": "Detailed rationale citing Order Book walls"
  }}
}}

CRITICAL - STRICT ADMIN LOCKS:
The following pinned lessons are absolute and immutable. You must adhere to them strictly:
{lessons_text}
"""
        
        user_prompt = f"Here is the current market data for {symbol}:\n{json.dumps(market_data, indent=2)}"
        
        # Call DeepSeek API
        # Using response_format={"type": "json_object"} ensures strict JSON output
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        
        # Parse response content
        response_content = response.choices[0].message.content
        
        try:
            # Try to parse the model output as JSON to validate it
            parsed_response = json.loads(response_content)
            # Ensure required keys exist
            if 'status' not in parsed_response:
                parsed_response['status'] = 'success'
            print(json.dumps(parsed_response))
        except json.JSONDecodeError:
            # Fallback if DeepSeek returns invalid JSON despite the instructions
            fallback_response = {
                "status": "error",
                "morning_briefing": "Failed to parse AI response",
                "action": {
                    "type": "STANDBY",
                    "market": symbol,
                    "reason": "DeepSeek returned invalid JSON. Defaulting to STANDBY for safety."
                },
                "raw_response": response_content
            }
            print(json.dumps(fallback_response))
            
    except Exception as e:
        # Return error as json on stdout to let Node.js handle it gracefully
        error_response = {
            "status": "error",
            "message": str(e)
        }
        print(json.dumps(error_response))
        sys.exit(1)

if __name__ == "__main__":
    main()
