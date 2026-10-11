package main

import (
  "encoding/json"
  "os"
)

type Input struct { Workers int `json:"workers"`; Values []int64 `json:"values"` }
type Answer struct { Index int; Square int64 }

func main() {
  var input Input
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { panic(err) }
  jobs := make(chan int, len(input.Values))
  ready := make(chan Answer, input.Workers)
  finished := make(chan struct{}, input.Workers)
  for index := range input.Values { jobs <- index }
  close(jobs)
  for worker := 0; worker < input.Workers; worker++ {
    go func() {
      for index := range jobs {
        value := input.Values[index]
        ready <- Answer{index, value * value}
      }
      finished <- struct{}{}
    }()
  }
  ordered := make([]int64, len(input.Values))
  for range input.Values {
    answer := <-ready
    ordered[answer.Index] = answer.Square
  }
  for worker := 0; worker < input.Workers; worker++ { <-finished }
  json.NewEncoder(os.Stdout).Encode(ordered)
}
