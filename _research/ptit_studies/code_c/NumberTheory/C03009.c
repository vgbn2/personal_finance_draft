/*
 * Filename: C03009.c
 * Description: C Program using functions: swap, solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <math.h>

void swap(int *a, int *b)
{
    int temp = *a;
    *a = *b;
    *b = temp;
}

int solve(int n)
{
    int res = 1;
    for (int i = 2; i <= sqrt(n); i++)
    {
        if (n % i == 0)
            res = res + i + n / i;
        if (i * i == n)
            res = res - i;
    }
    return res;
}

// Entry point
int main()
{
    int a, b;
    scanf("%d %d", &a, &b); // Read input
    if (a > b)
        swap(&a, &b);
    for (int i = a; i <= b; i++)
    {
        if (i == 1)
            continue;
        if (solve(i) == i)
            printf("%d ", i); // Print result
    }
    return 0;
}