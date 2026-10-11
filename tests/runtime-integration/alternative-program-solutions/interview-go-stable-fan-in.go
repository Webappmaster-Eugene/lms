package main

import (
  "encoding/json"
  "os"
)

type Item struct { Source int `json:"source"`; Index int `json:"index"`; Value int64 `json:"value"` }

func main() {
  var sources [][]int64
  if err := json.NewDecoder(os.Stdin).Decode(&sources); err != nil { panic(err) }
  pipe := make(chan Item)
  finished := make(chan struct{}, len(sources))
  buckets := make([][]Item, len(sources))
  for source, values := range sources {
    buckets[source] = make([]Item, len(values))
    go func(source int, values []int64) {
      for index, value := range values { pipe <- Item{source, index, value} }
      finished <- struct{}{}
    }(source, values)
  }
  go func() {
    for range sources { <-finished }
    close(pipe)
  }()
  for item := range pipe { buckets[item.Source][item.Index] = item }
  answer := []Item{}
  for _, bucket := range buckets { answer = append(answer, bucket...) }
  json.NewEncoder(os.Stdout).Encode(answer)
}
