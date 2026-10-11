import json
import sys
from itertools import groupby

answer = [[symbol, sum(1 for _ in run)]
          for symbol, run in groupby(json.load(sys.stdin))]
print(json.dumps(answer, ensure_ascii=False, separators=(',', ':')))
