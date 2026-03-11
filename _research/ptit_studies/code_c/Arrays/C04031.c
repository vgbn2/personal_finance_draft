/*
 * Filename: C04031.c
 * Description: C Program using functions: max, solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

int max(int a, int b)
{
    if (a > b)
        return a;
    return b;
}

void solve(int t)
{
    int n;
    scanf("%d", &n); // Read input
    int a[n];
    int b[n]; // QHĐ
    int Maxx = 0;

    scanf("%d", &a[0]); // Read input
    b[0] = 1;
    for (int i = 1; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        if (a[i] > a[i - 1])
            b[i] = b[i - 1] + 1;
        else
            b[i] = 1;
        Maxx = max(Maxx, b[i]);
    }
    printf("Test %d:\n%d\n", t, Maxx); // Print result
    for (int i = 0; i <= n - Maxx; i++)
        if (b[i + Maxx - 1] == Maxx)
        {
            for (int j = 0; j < Maxx; j++)
                printf("%d ", a[i + j]); // Print result
            printf("\n"); // Print result
            i += Maxx - 1;
        }
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