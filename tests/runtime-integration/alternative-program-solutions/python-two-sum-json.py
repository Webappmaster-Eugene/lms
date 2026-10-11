import json
import sys

data = json.load(sys.stdin)
earliest = {}
for index in range(len(data['nums']) - 1, -1, -1):
    earliest[data['nums'][index]] = index
answer = []
for right, value in enumerate(data['nums']):
    left = earliest.get(data['target'] - value, right)
    if left < right:
        answer = [left, right]
        break
print(json.dumps(answer, separators=(',', ':')))
