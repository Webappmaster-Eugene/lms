import json
import sys

# Opening events sort before closing events, so touching endpoints stay joined.
events = sorted(event for start, end in json.load(sys.stdin)
                for event in ((start, -1), (end, 1)))
depth = 0
result = []
for coordinate, change in events:
    if depth == 0:
        beginning = coordinate
    depth -= change
    if depth == 0:
        result.append([beginning, coordinate])
print(json.dumps(result, separators=(',', ':')))
