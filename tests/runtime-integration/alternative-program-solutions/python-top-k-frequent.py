import heapq
import json
import sys

data = json.load(sys.stdin)
counts = {}
for value in data['nums']:
    counts[value] = counts.get(value, 0) + 1
heap = [(-count, value) for value, count in counts.items()]
heapq.heapify(heap)
answer = [heapq.heappop(heap)[1] for _ in range(data['k'])]
print(json.dumps(answer, separators=(',', ':')))
