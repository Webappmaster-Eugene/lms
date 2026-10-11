import json
import sys
from itertools import accumulate

data = json.load(sys.stdin)
prefixes = list(accumulate(data['nums'], initial=0))
later = {}
total = 0
for prefix in reversed(prefixes):
    total += later.get(prefix + data['k'], 0)
    later[prefix] = later.get(prefix, 0) + 1
print(total)
