import sys
import json

def main():
    try:
        # Read payload from stdin
        input_data = sys.stdin.read()
        if not input_data:
            raise ValueError("No input data received from stdin")
            
        payload = json.loads(input_data)
        
        # Extract components
        memory_state = payload.get('memory_state', {})
        market_data = payload.get('market', 'Unknown')
        
        # Extract morning_briefing
        morning_briefing = memory_state.get('morning_briefing', 'No briefing found')
        
        # Process and generate dummy action for Phase 1
        response = {
            "status": "success",
            "morning_briefing": morning_briefing,
            "action": {
                "type": "dummy_action",
                "market": market_data,
                "reason": "Integration established successfully."
            }
        }
        
        # Print JSON to stdout so Node.js can parse it
        print(json.dumps(response))
        
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
