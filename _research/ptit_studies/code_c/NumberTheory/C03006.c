/*
 * Filename: C03006.c
 * Description: C Program using functions: ucln, solve
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

int ucln(int a, int b)
{
    while (b > 0)
    {
        int x = a % b;
        a = b;
        b = x;
    }
    return a;
}

void solve(int t)
{
    int n;
    scanf("%d", &n); // Read input
    printf("Test %d: ", t); // Print result
    for (int i = 2; i <= sqrt(n); i++)
        if (n % i == 0)
        {
            int dem = 0;
            while (n % i == 0)
            {
                n /= i;
                dem++;
            }
            printf("%d(%d) ", i, dem); // Print result
            if (n == 1)
            {
                printf("\n"); // Print result
                return;
            }
        }
    if (n > 1)
        printf("%d(1)\n", n); // Print result
}

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    for (int t = 1; t <= T; t++)
        solve(t);
    return 0;
}