package main

import (
  "encoding/json"
  "os"
  "sort"
)

type Event struct { Key string `json:"key"`; Delta int64 `json:"delta"` }
type Total struct { Key string `json:"key"`; Total int64 `json:"total"` }

func main() {
  var events []Event
  if err := json.NewDecoder(os.Stdin).Decode(&events); err != nil { panic(err) }
  sort.SliceStable(events, func(i, j int) bool { return events[i].Key < events[j].Key })
  answer := []Total{}
  for start := 0; start < len(events); {
    key := events[start].Key
    var sum int64
    end := start
    for end < len(events) && events[end].Key == key {
      sum += events[end].Delta
      end++
    }
    answer = append(answer, Total{key, sum})
    start = end
  }
  json.NewEncoder(os.Stdout).Encode(answer)
}
