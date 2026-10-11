package main

import (
  "encoding/json"
  "os"
)

type Input struct {
  Values []int64 `json:"values"`
  Edits []struct { Index int `json:"index"`; Value int64 `json:"value"` } `json:"edits"`
}
type Snapshot struct { Before []int64 `json:"before"`; After []int64 `json:"after"` }

func main() {
  var input Input
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { panic(err) }
  before := append([]int64{}, input.Values...)
  for _, edit := range input.Edits { input.Values[edit.Index] = edit.Value }
  after := append([]int64{}, input.Values...)
  json.NewEncoder(os.Stdout).Encode(Snapshot{before, after})
}
