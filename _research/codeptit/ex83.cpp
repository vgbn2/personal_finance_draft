#include <stdio.h>
#include <math.h>

int main() {
    int t;
    scanf("%d", &t);
    while (t--) {
        int n, count = 0;
        scanf("%d", &n);
        for (int i = 1; i * i <= n; i++) {
            if (n % i == 0) {
                if (i % 2 == 0) count++;
                if ((n / i) % 2 == 0 && i != n / i) count++;
            }
        }
        printf("%d\n", count);
    }
    return 0;
}
