const crypto = require('crypto');

const SIMILARITY_THRESHOLD = 85;
const HASH_LENGTH = 64;

class SimHash {
  constructor() {
    this.hashBits = HASH_LENGTH;
  }

  tokenize(code, language) {
    let processed = code;
    
    processed = processed.replace(/\/\/.*$/gm, '');
    processed = processed.replace(/\/\*[\s\S]*?\*\//g, '');
    processed = processed.replace(/#.*$/gm, '');
    processed = processed.replace(/"""[\s\S]*?"""/g, '');
    processed = processed.replace(/'''[\s\S]*?'''/g, '');
    
    processed = processed.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, ' ');
    
    processed = processed.replace(/\s+/g, ' ');
    processed = processed.trim();
    
    if (language === 'cpp') {
      processed = processed.replace(/\b(int|long|short|char|float|double|void|bool|string|class|struct|namespace|using|typedef|template|typename|const|static|virtual|override|public|private|protected|return|if|else|for|while|do|switch|case|break|continue|goto|new|delete|sizeof|this|nullptr|true|false|and|or|not|xor|bitand|bitor|compl)\b/g, '');
      processed = processed.replace(/[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/g, 'FUNC');
      processed = processed.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, 'VAR');
    } else if (language === 'python') {
      processed = processed.replace(/\b(def|class|return|if|elif|else|for|while|break|continue|pass|import|from|as|try|except|finally|raise|with|lambda|yield|global|nonlocal|assert|del|in|is|not|and|or|True|False|None|self)\b/g, '');
      processed = processed.replace(/[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/g, 'FUNC');
      processed = processed.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, 'VAR');
    }
    
    processed = processed.replace(/\d+/g, 'NUM');
    
    const tokens = processed.match(/[a-zA-Z_]+|[\{\}\(\)\[\];,\.+\-*\/%=<>!&|^~?:]|NUM|FUNC|VAR/g) || [];
    
    return tokens.filter(t => t.trim().length > 0);
  }

  getFeatures(tokens) {
    const features = [];
    const n = tokens.length;
    
    for (let i = 0; i < n; i++) {
      features.push(tokens[i]);
    }
    
    for (let i = 0; i < n - 1; i++) {
      features.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
    
    for (let i = 0; i < n - 2; i++) {
      features.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }
    
    const weights = {};
    features.forEach(f => {
      weights[f] = (weights[f] || 0) + 1;
    });
    
    return weights;
  }

  hashString(str) {
    const hash = crypto.createHash('sha256').update(str).digest('hex');
    return BigInt('0x' + hash.substring(0, this.hashBits / 4));
  }

  compute(code, language) {
    const tokens = this.tokenize(code, language);
    if (tokens.length === 0) return BigInt(0);
    
    const features = this.getFeatures(tokens);
    const vector = new Array(this.hashBits).fill(0);
    
    for (const [feature, weight] of Object.entries(features)) {
      const hash = this.hashString(feature);
      
      for (let i = 0; i < this.hashBits; i++) {
        const bit = (hash >> BigInt(i)) & BigInt(1);
        if (bit === BigInt(1)) {
          vector[i] += weight;
        } else {
          vector[i] -= weight;
        }
      }
    }
    
    let fingerprint = BigInt(0);
    for (let i = 0; i < this.hashBits; i++) {
      if (vector[i] > 0) {
        fingerprint |= (BigInt(1) << BigInt(i));
      }
    }
    
    return fingerprint;
  }

  hammingDistance(hash1, hash2) {
    let xor = hash1 ^ hash2;
    let distance = 0;
    
    while (xor > 0) {
      distance += Number(xor & BigInt(1));
      xor >>= BigInt(1);
    }
    
    return distance;
  }

  similarityScore(hash1, hash2) {
    const distance = this.hammingDistance(hash1, hash2);
    const maxDistance = this.hashBits;
    return ((maxDistance - distance) / maxDistance) * 100;
  }

  fingerprintToString(fingerprint) {
    return fingerprint.toString(16).padStart(this.hashBits / 4, '0');
  }

  stringToFingerprint(str) {
    return BigInt('0x' + str);
  }
}

const simHash = new SimHash();

module.exports = {
  SimHash,
  simHash,
  SIMILARITY_THRESHOLD,
  HASH_LENGTH
};
