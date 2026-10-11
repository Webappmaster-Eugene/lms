import json
import sys
from collections import deque

window = deque()
members = set()
best = 0
for character in json.load(sys.stdin):
    while character in members:
        members.remove(window.popleft())
    window.append(character)
    members.add(character)
    best = max(best, len(window))
print(best)
