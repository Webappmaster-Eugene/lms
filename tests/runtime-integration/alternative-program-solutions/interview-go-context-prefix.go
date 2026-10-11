package main

import (
  "context"
  "encoding/json"
  "os"
)

type Input struct { Values []int64 `json:"values"`; Take int `json:"take"` }
type Output struct { Values []int64 `json:"values"`; Cancelled bool `json:"cancelled"` }

func produce(ctx context.Context, values []int64) (<-chan int64, <-chan struct{}) {
  output := make(chan int64)
  done := make(chan struct{})
  go func() {
    defer close(done)
    defer close(output)
    for _, value := range values {
      select { case <-ctx.Done(): return; case output <- value: }
    }
  }()
  return output, done
}

func transform(ctx context.Context, input <-chan int64) (<-chan int64, <-chan struct{}) {
  output := make(chan int64)
  done := make(chan struct{})
  go func() {
    defer close(done)
    defer close(output)
    for {
      select {
      case <-ctx.Done(): return
      case value, open := <-input:
        if !open { return }
        select { case <-ctx.Done(): return; case output <- value + value: }
      }
    }
  }()
  return output, done
}

func main() {
  var input Input
  if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil { panic(err) }
  ctx, cancel := context.WithCancel(context.Background())
  values, producerDone := produce(ctx, input.Values)
  doubled, transformerDone := transform(ctx, values)
  answer := []int64{}
  count := min(input.Take, len(input.Values))
  for len(answer) < count { answer = append(answer, <-doubled) }
  cancel()
  <-producerDone
  <-transformerDone
  json.NewEncoder(os.Stdout).Encode(Output{answer, input.Take < len(input.Values)})
}
