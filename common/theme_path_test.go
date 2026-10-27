package common

import "testing"

func TestIsDefaultOnlyPath(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/", false},
		{"/console", false},
		{"/console/token", false},
		{"/security", true},
		{"/security/access-tokens", true},
		{"/keys", true},
		{"/dashboard", true},
		{"/securityx", false},
		{"/keysomething", false},
	}
	for _, c := range cases {
		if got := IsDefaultOnlyPath(c.path); got != c.want {
			t.Errorf("IsDefaultOnlyPath(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}
