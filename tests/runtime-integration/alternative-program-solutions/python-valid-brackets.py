import json
import sys

expected = []
closing = dict(zip('([{', ')]}'))
valid = True
for character in json.load(sys.stdin):
    if character in closing:
        expected.append(closing[character])
    elif not expected or expected.pop() != character:
        valid = False
        break
print(json.dumps(valid and not expected))
