import json
import sys

rows = json.load(sys.stdin)
remaining = {(row, column) for row, cells in enumerate(rows)
             for column, value in enumerate(cells) if value == '1'}
answer = 0
while remaining:
    pending = [remaining.pop()]
    answer += 1
    while pending:
        row, column = pending.pop()
        for adjacent in ((row - 1, column), (row + 1, column),
                         (row, column - 1), (row, column + 1)):
            if adjacent in remaining:
                remaining.remove(adjacent)
                pending.append(adjacent)
print(answer)
