import json
import sys
from collections import Counter

locations = {}
answer = []
for word in json.load(sys.stdin):
    signature = frozenset(Counter(word).items())
    if signature not in locations:
        locations[signature] = len(answer)
        answer.append([])
    answer[locations[signature]].append(word)
print(json.dumps(answer, ensure_ascii=False, separators=(',', ':')))
