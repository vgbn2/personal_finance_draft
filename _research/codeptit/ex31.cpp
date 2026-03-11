#include <stdio.h>

int check(int n) {
    int ogog = n;
    int b = 0;
    while (n > 0) {
        int a = 1;
        for (int i = 1; i <= n % 10; i++) {
            a *= i;
        }
        b += a;
        n /= 10;
    }
    return b == ogog;
}

int main() {
    int n;
    scanf("%d", &n);
    if (check(n)) {
        printf("1");
    } else {
        printf("0");
    }
    return 0;
}
