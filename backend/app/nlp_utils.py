import re

def extract_entities_from_kannada_text(text: str) -> dict:
    """
    Extracts key entity categories (suspects, weapons, vehicles, amount) 
    from Kannada FIR description using regex patterns.
    """
    entities = {
        "suspects": [],
        "weapons": [],
        "vehicles": [],
        "monetary_value": None
    }
    
    # 1. Weapon keywords
    weapons_patterns = {
        "knife/chopper": r"(ಚಾಕು|ಕತ್ತಿ|ಲಾರಾ|ಕೊಡಲಿ)",
        "iron rod": r"(ಕಬಿಣದ ರಾಡ್|ಕಬ್ಬಿಣದ ರಾಡ್|ಕಡ್ಡಿ|ದೊಣ್ಣೆ|ಕೋಲು)",
        "firearm": r"(ಬಂದೂಕು|ಪಿಸ್ತೂಲ್|ರಿವಾಲ್ವರ್)"
    }
    for weapon, pattern in weapons_patterns.items():
        if re.search(pattern, text):
            entities["weapons"].append(weapon)
            
    # 2. Vehicle keywords
    vehicle_patterns = {
        "two-wheeler": r"(ದ್ವಿಚಕ್ರ ವಾಹನ|ಬೈಕ್|ಸ್ಕೂಟರ್|ಟು ವೀಲರ್)",
        "four-wheeler": r"(ಕಾರು|ಜೀಪು|ಲಾರಿ|ಟೆಂಪೋ|ಆಟೋ)"
    }
    for vehicle, pattern in vehicle_patterns.items():
        if re.search(pattern, text):
            entities["vehicles"].append(vehicle)

    # 3. Currency / Amount (e.g. ರೂ. 50,000/- or 5 ಲಕ್ಷ)
    amount_match = re.search(r"ರೂ\.\s*([\d,]+)", text)
    if amount_match:
        entities["monetary_value"] = f"Rs. {amount_match.group(1)}"
    else:
        lakh_match = re.search(r"([\d,]+)\s*ಲಕ್ಷ", text)
        if lakh_match:
            entities["monetary_value"] = f"Rs. {lakh_match.group(1)} Lakh"

    # 4. Suspect Names (common Kannada name suffix patterns/accusations)
    suspect_matches = re.findall(r"ಆರೋಪಿ\s+([A-Za-zÀ-ÿ\u0c80-\u0cff\s]+)(?:ಎಂಬುವವರು|ಎಂಬುವನು|ಎಂಬಾಕೆ)", text)
    if suspect_matches:
        entities["suspects"] = [name.strip() for name in suspect_matches if name.strip()]

    return entities
