/*
 * Filename: C05017.c
 * Description: C Program using functions: solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

// Function to solve specific test case
void solve()
{
    int n, m;
    scanf("%d %d", &n, &m); // Read input
    int a[n][m];
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++)
            scanf("%d", &a[i][j]); // Read input
    int tren = 0, duoi = n - 1;
    int trai = 0, phai = m - 1;
    int d = 0;
    while (d < n * m)
    {
        for (int i = trai; i <= phai; i++)
        {
            printf("%d ", a[tren][i]); // Print result
            d++;
        }
        if (d == n * m)
            break;
        tren++;
        for (int i = tren; i <= duoi; i++)
        {
            printf("%d ", a[i][phai]); // Print result
            d++;
        }
        if (d == n * m)
            break;
        phai--;
        for (int i = phai; i >= trai; i--)
        {
            printf("%d ", a[duoi][i]); // Print result
            d++;
        }
        if (d == n * m)
            break;
        duoi--;
        for (int i = duoi; i >= tren; i--)
        {
            printf("%d ", a[i][trai]); // Print result
            d++;
        }
        trai++;
    }
    printf("\n"); // Print result
}

// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
        solve();
    return 0;
}